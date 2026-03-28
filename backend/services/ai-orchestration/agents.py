"""
Layer 2: 논리적 에이전트
=======================

각 에이전트는 독립된 @serve.deployment이지만 GPU를 직접 점유하지 않음.
SharedModelWorker의 handle을 통해 GPU 연산을 위임.

핵심 설계 원칙:
    - 에이전트 자체는 num_gpus=0 (CPU만 사용)
    - 전처리/후처리는 에이전트 내부에서 수행 (CPU)
    - GPU 추론만 SharedModelWorker.remote()로 위임
    - → 에이전트 수평 확장(num_replicas 증가) 시 GPU 추가 불필요
"""

import logging
import os
import time
from typing import Optional

import cv2

import httpx
import numpy as np
import ray
from ray import serve

logger = logging.getLogger("pawfiler.agents")


# ============================================================
# VideoAgent
# ============================================================

@serve.deployment(
    name="video_agent",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.1, "num_gpus": 0},
    max_ongoing_requests=16,
)
class VideoAgent:
    """
    영상 프레임 → 35-class 분류 + Feature 벡터 추출.
    
    문서 §5-1 구현:
        1. 프레임 정규화/리사이즈 (CPU)
        2. SharedModelWorker.video_inference() 호출 (GPU)
        3. Softmax → Top-K 후보 + confidence 계산 (CPU)
    """

    # 워터마크 키워드 → 클래스명 매핑
    WATERMARK_MAP = {
        "sora": "Sora",
        "kling": "Kling",
        "runway": "Gen3",
        "gen-3": "Gen3",
        "gen3": "Gen3",
        "luma": "Luma",
        "pika": "Pika",
        "open-sora": "Open-Sora",
        "opensora": "Opensora",
        "hunyuan": "HunyuanVideo",
        "wan": "Wan2.1",
        "vidu": "vidu",
    }

    def __init__(self, model_worker):
        self.model = model_worker  # SharedModelWorker의 handle
        self.class_names = self._load_class_names()
        self._ocr_reader = None  # lazy init
        logger.info("VideoAgent initialized")

    async def predict(self, frames_ref) -> dict:
        """
        Args:
            frames_ref: ray.ObjectRef — Plasma Store에 저장된 (T, C, H, W) 텐서
        Returns:
            {
                "is_fake": bool,
                "ai_model": str,
                "confidence": float,
                "features": np.ndarray,  # Fusion용
                "top_k": [{"class": str, "prob": float}, ...]
            }
        """
        t0 = time.perf_counter()

        # 1. Plasma에서 Zero-copy로 프레임 가져오기 (ObjectRef 또는 numpy array 모두 처리)
        if isinstance(frames_ref, np.ndarray):
            frames_np = frames_ref
        else:
            frames_np = ray.get(frames_ref)

        # 2. CPU 전처리: 정규화
        frames_np = self._normalize(frames_np)

        # 3. GPU 추론 위임
        result = await self.model.video_inference.remote(frames_np)

        # 4. CPU 후처리: softmax → 판단
        logits = result["logits"].squeeze(0)  # (NUM_CLASSES,)
        probs = self._softmax(logits)
        top_idx = int(np.argmax(probs))
        confidence = float(probs[top_idx])

        # Top-3 후보
        top_k_indices = np.argsort(probs)[::-1][:3]
        top_k = [
            {"class": self.class_names[i], "prob": round(float(probs[i]), 4)}
            for i in top_k_indices
        ]

        predicted_class = self.class_names[top_idx]
        
        # 디버그 로그
        print(f"[VideoAgent] Top-3: {top_k}", flush=True)
        print(f"[VideoAgent] Predicted: {predicted_class} ({probs[top_idx]:.4f})", flush=True)

        # 워터마크 오버라이드: 영상에 명시된 브랜드가 있으면 모델 예측보다 우선
        watermark_class = self._detect_watermark(frames_np)
        if watermark_class:
            predicted_class = watermark_class
            print(f"[VideoAgent] Overridden by watermark → {predicted_class}", flush=True)

        is_fake = predicted_class.lower() not in ("real",)
        
        # 신뢰도가 낮으면 uncertain 처리
        if probs[top_idx] < 0.75:
            is_fake = False  # uncertain으로 처리
            print(f"[VideoAgent] Low confidence, marking as uncertain", flush=True)

        # 프레임별 점수 (라인 차트용) — 각 프레임의 fake 확률
        frame_logits = result.get("frame_logits")  # (T, NUM_CLASSES) or None
        if frame_logits is not None:
            frame_probs = np.array([self._softmax(fl) for fl in frame_logits])
            real_idx = self.class_names.index("Real") if "Real" in self.class_names else -1
            frame_scores = [
                round(float(1 - fp[real_idx]) if real_idx >= 0 else float(fp.max()), 4)
                for fp in frame_probs
            ]
        else:
            # frame_logits 없으면 전체 confidence를 16프레임에 균등 분배 (fallback)
            frame_scores = [round(confidence, 4)] * 16

        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(f"VideoAgent: {predicted_class} ({confidence:.2%}) in {elapsed:.1f}ms")

        return {
            "is_fake": is_fake,
            "ai_model": predicted_class if is_fake else None,
            "confidence": round(confidence, 4),
            "features": result["features"].squeeze(0),  # (feature_dim,)
            "top_k": top_k,
            "frame_scores": frame_scores,
        }

    def _detect_watermark(self, frames_np: np.ndarray) -> Optional[str]:
        """첫 3프레임에서 OCR로 워터마크 감지 → 클래스명 반환, 없으면 None."""
        try:
            if self._ocr_reader is None:
                import easyocr
                self._ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)

            # (T, C, H, W) → (H, W, C) BGR, 첫 3프레임만 검사
            for frame in frames_np[:3]:
                img = (np.transpose(frame, (1, 2, 0)) * 255).astype(np.uint8)
                img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                results = self._ocr_reader.readtext(img_bgr, detail=0)
                text = " ".join(results).lower()
                for keyword, class_name in self.WATERMARK_MAP.items():
                    if keyword in text:
                        print(f"[VideoAgent] Watermark detected: '{keyword}' → {class_name}", flush=True)
                        return class_name
        except Exception as e:
            print(f"[VideoAgent] OCR failed: {e}", flush=True)
        return None

    def _normalize(self, frames: np.ndarray) -> np.ndarray:
        """학습 시 /255.0만 적용했으므로 추가 정규화 없음."""
        return frames

    def _softmax(self, logits: np.ndarray) -> np.ndarray:
        exp = np.exp(logits - np.max(logits))
        return exp / exp.sum()

    def _load_class_names(self) -> list:
        """35 클래스 이름 매핑. 실제로는 JSON 파일에서 로드."""
        # latest.pt 학습 시 사용한 클래스 목록 (35개)
        return [
            'AccVideo', 'AnimateDiff', 'Cogvideox1.5', 'EasyAnimate',
            'Gen2', 'Gen3', 'HunyuanVideo', 'IPOC', 'Jimeng', 'LTX',
            'Luma', 'Open-Sora', 'OpenSource_I2V_EasyAnimate', 'OpenSource_I2V_LTX',
            'OpenSource_I2V_Pyramid-Flow', 'OpenSource_I2V_SEINE', 'OpenSource_I2V_SVD',
            'OpenSource_I2V_VideoCrafter', 'OpenSource_V2V_Cogvideox1.5', 'OpenSource_V2V_LTX',
            'Opensora', 'Pyramid-Flow', 'Real', 'RepVideo', 'SEINE', 'SVD', 'Sora',
            'VideoCrafter', 'Wan2.1', 'causvid_24fps', 'vidu', 'wan', 'real', 'fake', 'audio_fake',
        ]


# ============================================================
# AudioAgent
# ============================================================

@serve.deployment(
    name="audio_agent",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.1, "num_gpus": 0},
    max_ongoing_requests=16,
)
class AudioAgent:
    """
    음성 신호 → real/synthetic 판별 + 음성 모델 식별.
    
    문서 §5-2 구현:
        1. 오디오 전처리: MFCC, Mel-spectrogram 추출 (CPU)
        2. SharedModelWorker.audio_inference() → Wav2Vec2 features (GPU)
        3. HMM 기반 시퀀스 패턴 분석 (CPU)
        4. 최종 판단: real / synthetic + 모델명
    """

    def __init__(self, model_worker):
        self.model = model_worker
        # HuggingFace Inference API (audio deepfake detection)
        self._hf_token = os.environ.get("HUGGINGFACE_TOKEN")
        self._hf_model = "facebook/wav2vec2-base"  # feature extractor 용도
        logger.info("AudioAgent initialized")

    async def predict(self, audio_ref) -> dict:
        """
        Args:
            audio_ref: ray.ObjectRef — Plasma에 저장된 (samples,) 오디오
        Returns:
            {
                "is_synthetic": bool,
                "voice_model": Optional[str],
                "confidence": float,
                "features": np.ndarray,  # Fusion용 (768,)
            }
        """
        t0 = time.perf_counter()

        # 1. Plasma에서 오디오 가져오기 (ObjectRef 또는 numpy array 모두 처리)
        if isinstance(audio_ref, np.ndarray):
            audio_np = audio_ref
        else:
            audio_np = ray.get(audio_ref)

        # 2. CPU 전처리
        mfcc_features = self._extract_mfcc(audio_np)
        spectral_flatness = self._spectral_flatness(audio_np)

        # 3. GPU: Wav2Vec2 feature extraction
        result = await self.model.audio_inference.remote(audio_np)
        wav2vec_features = result["features"].squeeze(0)  # (768,)

        # 4. HuggingFace Inference API로 보강 (토큰 있을 때만)
        hf_score = await self._hf_classify(audio_np)

        # 5. CPU: 합성 여부 판단 (로컬 + HF 앙상블)
        local_score = self._hmm_classify(wav2vec_features, mfcc_features)
        combined_score = (local_score * 0.5 + hf_score * 0.5) if hf_score is not None else local_score

        is_synthetic = combined_score > 0.5
        confidence = float(max(combined_score, 1 - combined_score))

        voice_model = self._identify_voice_model(wav2vec_features, spectral_flatness) if is_synthetic else None

        # 세그먼트별 점수 (바 차트용) — 1초 단위로 분할
        sr = 16000
        seg_len = sr  # 1초
        n_segs = max(1, len(audio_np) // seg_len)
        segment_scores = []
        for i in range(n_segs):
            seg = audio_np[i * seg_len:(i + 1) * seg_len]
            seg_mfcc = self._extract_mfcc(seg)
            seg_flat = self._spectral_flatness(seg)
            seg_score = self._hmm_classify(wav2vec_features, seg_mfcc)
            segment_scores.append({"t": i, "score": round(float(seg_score), 4)})

        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(f"AudioAgent: {'synthetic' if is_synthetic else 'real'} ({confidence:.2%}) in {elapsed:.1f}ms")

        return {
            "is_synthetic": is_synthetic,
            "voice_model": voice_model,
            "confidence": round(confidence, 4),
            "features": wav2vec_features,
            "segment_scores": segment_scores,
        }

    async def _hf_classify(self, audio_np: np.ndarray) -> Optional[float]:
        """
        HuggingFace Inference API로 음성 합성 여부 보조 판단.
        토큰 없거나 실패 시 None 반환 → 로컬 점수만 사용.
        """
        if not self._hf_token:
            return None
        try:
            import io, soundfile as sf
            buf = io.BytesIO()
            sf.write(buf, audio_np, 16000, format="WAV")
            buf.seek(0)
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"https://api-inference.huggingface.co/models/MelissaAI/deepfake-audio-detection",
                    headers={"Authorization": f"Bearer {self._hf_token}"},
                    content=buf.read(),
                )
            if resp.status_code != 200:
                return None
            labels = resp.json()
            # 모델 출력: [{"label": "fake", "score": 0.9}, {"label": "real", "score": 0.1}]
            for item in labels:
                if item.get("label", "").lower() in ("fake", "spoof", "synthetic"):
                    return float(item["score"])
        except Exception as e:
            logger.warning(f"HF classify failed: {e}")
        return None

    def _extract_mfcc(self, audio: np.ndarray, n_mfcc: int = 13) -> np.ndarray:
        """MFCC 추출 (librosa). 시간 축 평균 → (n_mfcc,)"""
        import librosa
        mfcc = librosa.feature.mfcc(y=audio, sr=16000, n_mfcc=n_mfcc)  # (n_mfcc, T)
        return mfcc.mean(axis=1).astype(np.float32)  # (n_mfcc,)

    def _spectral_flatness(self, audio: np.ndarray) -> float:
        """스펙트럼 평탄도. 합성 음성은 자연음 대비 평탄도가 높음."""
        import librosa
        flatness = librosa.feature.spectral_flatness(y=audio)  # (1, T)
        return float(flatness.mean())

    def _hmm_classify(self, wav2vec_feat: np.ndarray, mfcc_feat: np.ndarray) -> float:
        """
        wav2vec2 features + MFCC를 결합해 합성 음성 여부 판단.
        HMM 모델 없을 경우 spectral 통계 기반 휴리스틱으로 fallback.
        """
        # wav2vec2 feature의 L2 norm 분포: 합성 음성은 자연음보다 norm이 낮은 경향
        wav2vec_norm = float(np.linalg.norm(wav2vec_feat))
        # MFCC 분산: 합성 음성은 분산이 낮음
        mfcc_var = float(np.var(mfcc_feat))

        # 정규화된 점수 (경험적 임계값)
        norm_score = 1.0 - min(wav2vec_norm / 30.0, 1.0)   # norm 낮을수록 합성 의심
        var_score = 1.0 - min(mfcc_var / 50.0, 1.0)        # 분산 낮을수록 합성 의심

        return float(0.6 * norm_score + 0.4 * var_score)

    def _identify_voice_model(self, wav2vec_feat: np.ndarray, spectral_flatness: float) -> Optional[str]:
        """
        wav2vec2 feature 통계로 음성 합성 모델 추정.
        현재는 규칙 기반. 추후 분류기로 교체 가능.
        """
        feat_mean = float(wav2vec_feat.mean())
        feat_std = float(wav2vec_feat.std())

        # 각 TTS 모델의 특성 기반 휴리스틱
        if spectral_flatness > 0.15:
            return "ElevenLabs"   # 높은 평탄도 → ElevenLabs 특성
        elif feat_std < 0.3:
            return "VALL-E"       # 낮은 분산 → VALL-E 특성
        elif feat_mean > 0.1:
            return "Bark"
        else:
            return "unknown_tts"


# ============================================================
# SyncAgent
# ============================================================

@serve.deployment(
    name="sync_agent",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.1, "num_gpus": 0},
    max_ongoing_requests=8,
)
class SyncAgent:
    """
    문서 §5-3. SyncNet 기반 립싱크 일치도 분석.
    모달리티가 'both'일 때만 호출됨.
    """

    def __init__(self, model_worker):
        self.model = model_worker
        logger.info("SyncAgent initialized")

    async def predict(self, frames_ref, audio_ref) -> dict:
        """
        Returns:
            {"is_synced": bool, "confidence": float, "sync_score": float}
        """
        frames_np = frames_ref if isinstance(frames_ref, np.ndarray) else ray.get(frames_ref)
        audio_np = audio_ref if isinstance(audio_ref, np.ndarray) else ray.get(audio_ref)

        result = await self.model.sync_inference.remote(frames_np, audio_np)
        sync_score = result["sync_score"]

        return {
            "is_synced": sync_score > 0.5,
            "confidence": round(abs(sync_score - 0.5) * 2, 4),  # 0~1 정규화
            "sync_score": round(sync_score, 4),
        }


# ============================================================
# FusionAgent (Late Fusion + Cross-Attention)
# ============================================================

@serve.deployment(
    name="fusion_agent",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.1, "num_gpus": 0},
    max_ongoing_requests=16,
)
class FusionAgent:
    """
    문서 §5-4. 각 에이전트의 결과를 종합하여 최종 판단.
    
    Fusion 전략:
        - Late Fusion: 가중 평균 (video 0.7 + audio 0.3)
        - Cross-attention은 Phase 4에서 추가 예정
    
    출력: 문서 §8의 최종 응답 포맷
    """

    WEIGHTS = {"video": 0.55, "audio": 0.20, "sync": 0.10, "metadata": 0.15}

    def __init__(self):
        import os
        self._db_url = os.environ.get("DATABASE_URL")
        self._conn = None
        if self._db_url:
            try:
                import psycopg2
                self._conn = psycopg2.connect(self._db_url)
                logger.info("FusionAgent: pgvector DB connected")
            except Exception as e:
                logger.warning(f"FusionAgent: DB connection failed ({e}), similar_cases disabled")

        # Nova Lite (Amazon Bedrock) — 자연어 설명 생성용
        self._bedrock = None
        try:
            import boto3
            self._bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-2")
            logger.info("FusionAgent: Bedrock Nova Lite connected")
        except Exception as e:
            logger.warning(f"FusionAgent: Bedrock unavailable ({e}), using template explanation")

        logger.info("FusionAgent initialized")

    async def ensemble(self, agent_results: dict) -> dict:
        """
        Args:
            agent_results: {
                "video": VideoAgent 결과,
                "audio": AudioAgent 결과 (optional),
                "sync": SyncAgent 결과 (optional),
            }
        """
        breakdown = {}
        weighted_confidence = 0.0
        total_weight = 0.0

        # ── Video 결과 ──
        if "video" in agent_results and agent_results["video"].get("verdict") != "error":
            v = agent_results["video"]
            breakdown["video"] = {
                "is_fake": v["is_fake"],
                "ai_model": v.get("ai_model"),
                "confidence": v["confidence"],
            }
            weighted_confidence += v["confidence"] * self.WEIGHTS["video"]
            total_weight += self.WEIGHTS["video"]

        # ── Audio 결과 ──
        if "audio" in agent_results and agent_results["audio"].get("verdict") != "error":
            a = agent_results["audio"]
            breakdown["audio"] = {
                "is_synthetic": a["is_synthetic"],
                "voice_model": a.get("voice_model"),
                "confidence": a["confidence"],
            }
            weighted_confidence += a["confidence"] * self.WEIGHTS["audio"]
            total_weight += self.WEIGHTS["audio"]

        # ── Sync 결과 ──
        if "sync" in agent_results and agent_results["sync"].get("verdict") != "error":
            s = agent_results["sync"]
            sync_score = float(s.get("sync_score", 0.5))
            # 립싱크 불일치(낮은 sync_score)는 fake 신호
            sync_fake_score = 1.0 - sync_score
            breakdown["sync"] = {
                "is_synced": s["is_synced"],
                "confidence": s["confidence"],
                "sync_score": sync_score,
                "fake_score": round(sync_fake_score, 4),
            }
            weighted_confidence += sync_fake_score * self.WEIGHTS["sync"]
            total_weight += self.WEIGHTS["sync"]

        # ── Metadata 결과 ──
        if "metadata" in agent_results and agent_results["metadata"]:
            m = agent_results["metadata"]
            meta_fake_score = self._score_metadata(m)
            breakdown["metadata"] = {
                "fake_score": round(meta_fake_score, 4),
                "codec": m.get("codec", "unknown"),
                "resolution": m.get("resolution", "unknown"),
                "fps": m.get("fps", "unknown"),
                "bitrate": m.get("bitrate", 0),
            }
            weighted_confidence += meta_fake_score * self.WEIGHTS["metadata"]
            total_weight += self.WEIGHTS["metadata"]

        # ── 최종 판단 ──
        final_confidence = (
            weighted_confidence / total_weight if total_weight > 0 else 0.0
        )

        # 각 에이전트의 fake 판정 + 신뢰도 체크
        fake_signals = []
        
        video_data = breakdown.get("video", {})
        # Video 에이전트 임계값 낮춤 (85% -> 70%)
        if video_data.get("is_fake") and video_data.get("confidence", 0) >= 0.70:
            fake_signals.append("video")
        
        audio_data = breakdown.get("audio", {})
        if audio_data.get("is_synthetic") and audio_data.get("confidence", 0) >= 0.80:
            fake_signals.append("audio")
        
        sync_data = breakdown.get("sync", {})
        if sync_data.get("is_synced") is False and sync_data.get("confidence", 0) >= 0.75:
            fake_signals.append("sync")
        
        # 최종 판정
        # 1. 40~60% 구간은 UNCERTAIN
        if 0.40 <= final_confidence <= 0.60:
            verdict = "uncertain"
        # 2. 60% 이상 + fake 신호 있으면 FAKE
        elif final_confidence >= 0.60 and len(fake_signals) >= 1:
            verdict = "fake"
        # 3. 40% 미만이면 REAL
        elif final_confidence < 0.40:
            verdict = "real"
        # 4. 60% 이상인데 fake 신호 없으면 UNCERTAIN
        else:
            verdict = "uncertain"

        # ── 설명 생성 ──
        explanation = await self._generate_explanation(breakdown, verdict=verdict)

        return {
            "verdict": verdict,
            "confidence": round(final_confidence, 4),
            "breakdown": breakdown,
            "explanation": explanation,
            "similar_cases": self._query_similar_cases(agent_results),
        }

    def _query_similar_cases(self, agent_results: dict) -> list:
        """
        video features로 pgvector에서 유사 케이스 top-3 조회.
        DB 없으면 빈 배열 반환.
        """
        if self._conn is None:
            return []
        video = agent_results.get("video", {})
        features = video.get("features")
        if features is None:
            return []
        try:
            vec_str = "[" + ",".join(f"{x:.6f}" for x in features.tolist()) + "]"
            with self._conn.cursor() as cur:
                cur.execute("""
                    SELECT verdict, ai_model, confidence, 1 - (feature_vector <=> %s::vector) AS similarity
                    FROM analysis_cases
                    ORDER BY feature_vector <=> %s::vector
                    LIMIT 3
                """, (vec_str, vec_str))
                rows = cur.fetchall()
            return [
                {"verdict": r[0], "ai_model": r[1], "confidence": r[2], "similarity": round(r[3], 4)}
                for r in rows
            ]
        except Exception as e:
            logger.warning(f"similar_cases query failed: {e}")
            return []

    async def _generate_explanation(self, breakdown: dict, verdict: str) -> str:
        try:
            return await self._upstage_explain(breakdown, verdict)
        except Exception as e:
            logger.warning(f"Upstage failed: {e}, falling back to template")
        return self._template_explanation(breakdown)

    async def _upstage_explain(self, breakdown: dict, verdict: str) -> str:
        import json, asyncio, os, urllib.request
        video = breakdown.get("video", {})
        audio = breakdown.get("audio", {})
        sync = breakdown.get("sync", {})
        metadata = breakdown.get("metadata", {})

        prompt = (
            f"당신은 AI 생성 영상 탐지 전문가입니다. 아래 분석 결과를 바탕으로 왜 이 영상이 {'AI 생성 영상인지' if verdict == 'fake' else '실제 영상인지'} "
            f"한국어로 3문장 이내로 설명해주세요. 기술 용어는 쉽게 풀어서 설명하세요.\n\n"
            f"[영상 분석] {'AI 생성 의심' if video.get('is_fake') else '실제 영상'} - {video.get('ai_model', '알 수 없음')} (신뢰도: {video.get('confidence', 0):.0%})\n"
            f"[음성 분석] {'합성 음성' if audio.get('is_synthetic') else '실제 음성'} (신뢰도: {audio.get('confidence', 0):.0%})\n"
            f"[립싱크] {sync.get('sync_score', '미분석')}\n"
            f"[코덱/해상도] {metadata.get('codec', '알 수 없음')} / {metadata.get('resolution', '알 수 없음')}"
        )
        body = json.dumps({
            "model": "solar-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
        }).encode()
        api_key = os.environ.get("UPSTAGE_API_KEY", "")
        loop = asyncio.get_event_loop()
        def call():
            req = urllib.request.Request(
                "https://api.upstage.ai/v1/chat/completions",
                data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())["choices"][0]["message"]["content"].strip()
        return await loop.run_in_executor(None, call)

    async def _ollama_explain(self, breakdown: dict, verdict: str) -> str:
        import json, asyncio, urllib.request
        video = breakdown.get("video", {})
        audio = breakdown.get("audio", {})
        sync = breakdown.get("sync", {})

        prompt = (
            f"You are a deepfake detection expert. Analyze the result and write a 2-sentence explanation IN KOREAN ONLY.\n"
            f"Result: {'AI-generated video' if verdict == 'fake' else 'Real video'}\n"
            f"Video confidence: {video.get('confidence', 0):.0%}, AI model detected: {video.get('ai_model', 'unknown')}\n"
            f"Audio synthetic: {audio.get('is_synthetic', False)}, confidence: {audio.get('confidence', 0):.0%}\n"
            f"Write ONLY in Korean, 2 sentences max, no English."
        )
        body = json.dumps({"model": "tinyllama", "prompt": prompt, "stream": False}).encode()
        loop = asyncio.get_event_loop()
        def call():
            req = urllib.request.Request(
                "http://ollama:11434/api/generate",
                data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())["response"].strip()
        return await loop.run_in_executor(None, call)

    async def _nova_explain(self, breakdown: dict, verdict: str) -> str:
        import json, asyncio
        prompt = (
            f"딥페이크 탐지 결과를 한국어로 2문장 이내로 설명해줘.\n"
            f"판정: {verdict.upper()}\n"
            f"분석 데이터: {json.dumps(breakdown, ensure_ascii=False)}\n"
            f"사용자가 이해하기 쉽게, 기술 용어 없이 설명해."
        )
        body = {
            "messages": [{"role": "user", "content": prompt}],
            "inferenceConfig": {"maxTokens": 150, "temperature": 0.3},
        }
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: self._bedrock.invoke_model(
                modelId="amazon.nova-lite-v1:0",
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
        )
        import json as _json
        result = _json.loads(resp["body"].read())
        return result["output"]["message"]["content"][0]["text"].strip()

    def _score_metadata(self, metadata: dict) -> float:
        """메타데이터 기반 AI 생성 영상 의심 점수 (0~1)."""
        score = 0.5  # 기본값 중립
        # AI 생성 영상은 보통 완벽한 해상도/비트레이트를 가짐
        bitrate = int(metadata.get("bitrate", 0))
        fps_str = str(metadata.get("fps", "25/1"))
        try:
            fps = float(fps_str.split("/")[0]) / max(float(fps_str.split("/")[1]), 1) if "/" in fps_str else float(fps_str)
        except Exception:
            fps = 25.0
        # 비트레이트가 매우 낮으면 실제 영상일 가능성 높음
        if bitrate > 0 and bitrate < 500:
            score -= 0.15
        # AI 생성 영상은 정확히 24/30fps인 경우 많음
        if fps in (24.0, 30.0, 60.0):
            score += 0.1
        # 코덱이 h264/hevc면 중립, 특이 코덱이면 의심
        codec = metadata.get("codec", "")
        if codec not in ("h264", "hevc", "vp9", "av1", ""):
            score += 0.1
        return max(0.0, min(1.0, score))

    def _template_explanation(self, breakdown: dict) -> str:
        """Nova Lite 없을 때 템플릿 기반 설명."""
        parts = []
        if "video" in breakdown:
            v = breakdown["video"]
            if v["is_fake"] and v["ai_model"]:
                parts.append(f"영상: {v['ai_model']}로 생성됨 ({v['confidence']:.0%})")
            else:
                parts.append(f"영상: 실제 영상으로 판단 ({v['confidence']:.0%})")
        if "audio" in breakdown:
            a = breakdown["audio"]
            if a["is_synthetic"] and a["voice_model"]:
                parts.append(f"음성: {a['voice_model']} 합성 ({a['confidence']:.0%})")
            else:
                parts.append(f"음성: 실제 음성으로 판단 ({a['confidence']:.0%})")
        if "sync" in breakdown:
            s = breakdown["sync"]
            parts.append(f"립싱크 {'일치' if s['is_synced'] else '불일치'} ({s['confidence']:.0%})")
        return " | ".join(parts) if parts else "분석 결과 없음"
