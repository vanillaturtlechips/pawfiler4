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

    CONFIDENCE_THRESHOLD = 0.20  # Real 기피증 해결: 낮춰서 DL 검토 기회 확대

    def __init__(self, model_path: str = "/mnt/efs/models/models/xgboost_cascade.pkl"):
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
            import xgboost as xgb
            dmat = xgb.DMatrix(feature_vec.reshape(1, -1))
            pred = self.model.predict(dmat)[0]  # shape: (num_class,)
            # class 0 = real, 나머지 = AI 생성 도구
            prob_real = float(pred[0]) if hasattr(pred, '__len__') else float(pred)
            prob_fake = 1.0 - prob_real
            best_fake_class = int(np.argmax(pred[1:])) + 1 if hasattr(pred, '__len__') and len(pred) > 1 else 1
        else:
            # 모델 없으면 항상 Deep Path로
            return {
                "confident": False,
                "verdict": "real",
                "confidence": 0.5,
                "breakdown": {"video": {"is_fake": False, "ai_model": None, "confidence": 0.5}},
                "explanation": "경량 분석 불가: Deep Path로 전달",
            }

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
        """XGBoost 모델 로드. XGBClassifier(pkl) 또는 Booster(json) 모두 지원."""
        import xgboost as xgb

        # 네이티브 JSON 우선
        json_path = self.model_path.replace(".pkl", ".json")
        try:
            booster = xgb.Booster()
            booster.load_model(json_path)
            logger.info(f"XGBoost model loaded from {json_path}")
            return booster
        except Exception:
            pass

        # pickle fallback (XGBClassifier 포함)
        try:
            import pickle
            with open(self.model_path, "rb") as f:
                obj = pickle.load(f)
            # XGBClassifier → Booster 추출
            if hasattr(obj, "get_booster"):
                obj = obj.get_booster()
            logger.info(f"XGBoost model loaded from {self.model_path}")
            return obj
        except Exception as e:
            logger.warning(f"XGBoost model not found ({e}), cascade will pass-through")
            return None
