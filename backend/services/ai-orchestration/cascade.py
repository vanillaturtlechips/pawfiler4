"""
XGBoost Cascade Gate — 경량 1단계 필터
======================================

문서 §5-1 Cascade 파이프라인:
    ~80%의 요청을 XGBoost hand-crafted features로 즉시 판별.
    불확실한 ~20%만 무거운 Deep Path(VideoAgent+AudioAgent)로 전달.
    
    → GPU 비용 ~69% 절감 (문서 기재)
"""

import logging
import numpy as np
from ray import serve

logger = logging.getLogger("pawfiler.cascade")


@serve.deployment(
    name="xgboost_gate",
    num_replicas=2,  # CPU 전용, 가볍게 수평 확장
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
    max_ongoing_requests=64,  # 경량이므로 동시성 높게
)
class XGBoostGate:
    """
    Hand-crafted features 기반 경량 판별기.
    
    Features (문서 §5-1):
        - laplacian_var: 고주파 성분 (GAN은 약함)
        - dct_ratio: DCT 저주파 비율
        - channel_stats: RGB 채널별 mean/std
        - temporal_diff: 프레임 간 변화량 통계
    
    판단 로직:
        - confidence ≥ threshold → 즉시 반환 (confident=True)
        - confidence < threshold → Deep Path로 넘김 (confident=False)
    """

    CONFIDENCE_THRESHOLD = 0.85  # 이 이상이면 XGBoost만으로 판단

    def __init__(self, model_path: str = "/mnt/efs/models/xgboost_cascade.json"):
        self.model_path = model_path
        self.model = self._load_model()
        logger.info(f"XGBoostGate loaded (threshold={self.CONFIDENCE_THRESHOLD})")

    async def predict(self, features: dict) -> dict:
        """
        Args:
            features: {
                "laplacian_var": float,
                "dct_ratio": float,
                "channel_stats": list[float],  # 6개 (R_mean, R_std, G_mean, ...)
                "temporal_diff_mean": float,
                "temporal_diff_std": float,
            }
        Returns:
            {
                "confident": bool,  # True면 Cascade에서 종결
                "verdict": str,     # "real" / "fake"
                "confidence": float,
                "breakdown": dict,
            }
        """
        # Feature 벡터 구성
        feature_vec = self._to_vector(features)

        if self.model is not None:
            # XGBoost 추론
            import xgboost as xgb
            dmatrix = xgb.DMatrix(feature_vec.reshape(1, -1))
            probs = self.model.predict(dmatrix)  # (1, 2) — [real_prob, fake_prob]
            prob_fake = float(probs[0][1]) if probs.ndim > 1 else float(probs[0])
        else:
            # 모델 없으면 항상 Deep Path로
            prob_fake = 0.5

        confidence = max(prob_fake, 1 - prob_fake)
        is_fake = prob_fake > 0.5
        confident = confidence >= self.CONFIDENCE_THRESHOLD

        return {
            "confident": confident,
            "verdict": "fake" if is_fake else "real",
            "confidence": round(confidence, 4),
            "breakdown": {
                "video": {
                    "is_fake": is_fake,
                    "ai_model": None,  # XGBoost는 모델명 식별 불가
                    "confidence": round(confidence, 4),
                }
            },
            "explanation": f"경량 분석: {'위조' if is_fake else '실제'} ({confidence:.0%})",
        }

    def _to_vector(self, features: dict) -> np.ndarray:
        """Feature dict → numpy vector."""
        vec = [
            features.get("laplacian_var", 0.0),
            features.get("dct_ratio", 0.0),
            features.get("temporal_diff_mean", 0.0),
            features.get("temporal_diff_std", 0.0),
        ]
        vec.extend(features.get("channel_stats", [0.0] * 6))
        return np.array(vec, dtype=np.float32)

    def _load_model(self):
        """XGBoost 모델 로드. 없으면 None (개발 단계)."""
        try:
            import xgboost as xgb
            model = xgb.Booster()
            model.load_model(self.model_path)
            logger.info(f"XGBoost model loaded from {self.model_path}")
            return model
        except Exception as e:
            logger.warning(f"XGBoost model not found ({e}), cascade will pass-through")
            return None
