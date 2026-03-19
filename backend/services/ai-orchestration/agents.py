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
import time
from typing import Optional

import numpy as np
import ray
from ray import serve

logger = logging.getLogger("pawfiler.agents")


# ============================================================
# VideoAgent
# ============================================================

@serve.deployment(
    name="video_agent",
    num_replicas=2,
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
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

        # 1. Plasma에서 Zero-copy로 프레임 가져오기
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
    num_replicas=2,
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
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
        logger.info("AudioAgent initialized")

    async def predict(self, audio_ref) -> dict:
        """
        Args:
            audio_ref: ray.ObjectRef — Plasma에 저장된 (samples,) 오디오
        Returns:
            {
                "is_synthetic": bool,
                "voice_model": str | None,
                "confidence": float,
                "features": np.ndarray,  # Fusion용 (768,)
            }
        """
        t0 = time.perf_counter()

        # 1. Plasma에서 오디오 가져오기
        audio_np = ray.get(audio_ref)

        # 2. CPU 전처리
        mfcc_features = self._extract_mfcc(audio_np)
        spectral_flatness = self._spectral_flatness(audio_np)

        # 3. GPU: Wav2Vec2 feature extraction
        result = await self.model.audio_inference.remote(audio_np)
        wav2vec_features = result["features"].squeeze(0)  # (768,)

        # 4. CPU: HMM 기반 판단 (간소화)
        # 실제로는 학습된 HMM 모델로 시퀀스 분석
        combined_score = self._hmm_classify(wav2vec_features, mfcc_features)

        is_synthetic = combined_score > 0.5
        confidence = float(max(combined_score, 1 - combined_score))

        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(f"AudioAgent: {'synthetic' if is_synthetic else 'real'} ({confidence:.2%}) in {elapsed:.1f}ms")

        return {
            "is_synthetic": is_synthetic,
            "voice_model": "ElevenLabs" if is_synthetic else None,  # TODO: 모델 식별
            "confidence": round(confidence, 4),
            "features": wav2vec_features,
        }

    def _extract_mfcc(self, audio: np.ndarray, n_mfcc: int = 13) -> np.ndarray:
        """MFCC 추출. 실제로는 librosa.feature.mfcc 사용."""
        return np.random.randn(n_mfcc).astype(np.float32)  # placeholder

    def _spectral_flatness(self, audio: np.ndarray) -> float:
        """스펙트럼 평탄도. 합성 음성은 자연음 대비 평탄도가 다름."""
        return 0.5  # placeholder

    def _hmm_classify(self, wav2vec_feat: np.ndarray, mfcc_feat: np.ndarray) -> float:
        """HMM 기반 분류. 실제로는 hmmlearn 사용."""
        return 0.5  # placeholder


# ============================================================
# SyncAgent
# ============================================================

@serve.deployment(
    name="sync_agent",
    num_replicas=1,
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
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
        frames_np = ray.get(frames_ref)
        audio_np = ray.get(audio_ref)

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
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
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
        explanation = self._generate_explanation(breakdown)

        return {
            "verdict": "fake" if is_fake else "real",
            "confidence": round(final_confidence, 4),
            "breakdown": breakdown,
            "explanation": explanation,
            "similar_cases": [],  # TODO: 벡터 DB 연동 (문서 §7)
        }

    def _generate_explanation(self, breakdown: dict) -> str:
        """사람이 읽을 수 있는 설명 문자열 생성."""
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
            sync_status = "일치" if s["is_synced"] else "불일치"
            parts.append(f"립싱크 {sync_status} ({s['confidence']:.0%})")

        return " | ".join(parts) if parts else "분석 결과 없음"
