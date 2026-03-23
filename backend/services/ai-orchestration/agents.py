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

    def __init__(self, model_worker):
        self.model = model_worker  # SharedModelWorker의 handle
        self.class_names = self._load_class_names()
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
        is_fake = predicted_class != "real"

        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(f"VideoAgent: {predicted_class} ({confidence:.2%}) in {elapsed:.1f}ms")

        return {
            "is_fake": is_fake,
            "ai_model": predicted_class if is_fake else None,
            "confidence": round(confidence, 4),
            "features": result["features"].squeeze(0),  # (feature_dim,)
            "top_k": top_k,
        }

    def _normalize(self, frames: np.ndarray) -> np.ndarray:
        """ImageNet 정규화. 실제로는 decord/torchvision transforms 사용."""
        mean = np.array([0.485, 0.456, 0.406]).reshape(1, 3, 1, 1)
        std = np.array([0.229, 0.224, 0.225]).reshape(1, 3, 1, 1)
        return ((frames - mean) / std).astype(np.float32)

    def _softmax(self, logits: np.ndarray) -> np.ndarray:
        exp = np.exp(logits - np.max(logits))
        return exp / exp.sum()

    def _load_class_names(self) -> list:
        """35 클래스 이름 매핑. 실제로는 JSON 파일에서 로드."""
        # AIGVDBench 23종 + 특수 클래스
        return [
            "real", "fake", "audio_fake",
            "Sora", "Gen2", "Pika", "Kling", "HaiLuo",
            "Stable_Video", "AnimateDiff", "ModelScope",
            "Luma", "CogVideo", "LaVie", "Show1",
            "VideoCrafter", "OpenSora", "OpenSoraPlan",
            "Vidu", "Jimeng", "PixVerse", "Morph",
            "Magi", "HunyuanVideo", "NOVA",
            # 여유 클래스
            *[f"reserved_{i}" for i in range(10)]
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

        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(f"AudioAgent: {'synthetic' if is_synthetic else 'real'} ({confidence:.2%}) in {elapsed:.1f}ms")

        return {
            "is_synthetic": is_synthetic,
            "voice_model": voice_model,
            "confidence": round(confidence, 4),
            "features": wav2vec_features,
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

    WEIGHTS = {"video": 0.7, "audio": 0.3}

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
            breakdown["sync"] = {
                "is_synced": s["is_synced"],
                "confidence": s["confidence"],
            }

        # ── 최종 판단 ──
        final_confidence = (
            weighted_confidence / total_weight if total_weight > 0 else 0.0
        )

        is_fake = any([
            breakdown.get("video", {}).get("is_fake", False),
            breakdown.get("audio", {}).get("is_synthetic", False),
            breakdown.get("sync", {}).get("is_synced") is False  # 립싱크 불일치
            and breakdown.get("sync", {}).get("confidence", 0) > 0.7,
        ])

        # ── 설명 생성 ──
        explanation = await self._generate_explanation(breakdown, verdict="fake" if is_fake else "real")

        return {
            "verdict": "fake" if is_fake else "real",
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
        """
        Nova Lite로 자연어 설명 생성.
        Bedrock 없으면 템플릿 fallback.
        """
        if self._bedrock:
            try:
                return await self._nova_explain(breakdown, verdict)
            except Exception as e:
                logger.warning(f"Nova Lite failed: {e}, falling back to template")
        return self._template_explanation(breakdown)

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
