"""
Layer 1: SharedModelWorker — GPU 싱글톤
=======================================

역할:
    - EFS 마운트 경로에서 모든 모델 가중치를 GPU VRAM에 로드 (1회)
    - Video/Audio/Sync 에이전트가 이 객체의 handle을 통해 GPU 연산을 위임
    - 모델은 VRAM에 1벌만 존재 (싱글톤 패턴으로 메모리 절약)

VRAM 예산 (16GB GPU 기준):
    - backbone (MobileViTv2-100 + LSTM + head): ~4GB
    - wav2vec2: ~1.5GB
    - syncnet: ~0.5GB
    - 추론 배치 버퍼: ~10GB (여유)
"""

import os
import logging
from pathlib import Path

import torch
import torch.nn as nn
import numpy as np
from ray import serve

logger = logging.getLogger("pawfiler.models")

# ── 상수 ──
NUM_CLASSES = 35  # AIGVDBench 23종 + real/fake/audio_fake + 여유
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ============================================================
# VideoAgent 코어 모델 (Backbone + LSTM + Head)
# ============================================================

class VideoModel(nn.Module):
    """
    문서 §5-1의 VideoAgent 아키텍처.
    Backbone → LSTM → Classification Head
    
    입력: (B, T, C, H, W) — T개 프레임의 배치
    출력: (B, NUM_CLASSES) logits + (B, feature_dim) features
    """

    def __init__(self, backbone_name: str = "mobilevitv2_100", feature_dim: int = 256):
        super().__init__()
        # timm 기반 backbone (pretrained=False — 학습된 가중치는 체크포인트에서 로드)
        import timm
        self.backbone = timm.create_model(backbone_name, pretrained=False, num_classes=0)
        backbone_out = self.backbone.num_features

        self.lstm = nn.LSTM(backbone_out, feature_dim, batch_first=True)
        self.head = nn.Linear(feature_dim, NUM_CLASSES)
        self.feature_dim = feature_dim

    def forward(self, frames: torch.Tensor):
        """
        Args:
            frames: (B, T, C, H, W)
        Returns:
            logits: (B, NUM_CLASSES)
            features: (B, feature_dim) — Fusion에서 사용
        """
        B, T, C, H, W = frames.shape
        # Backbone: 프레임별 특징 추출
        x = frames.view(B * T, C, H, W)
        feats = self.backbone(x)  # (B*T, backbone_out)
        feats = feats.view(B, T, -1)  # (B, T, backbone_out)

        # LSTM: 시간 축 요약
        _, (h, _) = self.lstm(feats)  # h: (1, B, feature_dim)
        h = h.squeeze(0)  # (B, feature_dim)

        logits = self.head(h)  # (B, NUM_CLASSES)
        return logits, h  # h를 feature로 반환 (Fusion용)


# ============================================================
# SharedModelWorker (GPU 싱글톤 Deployment)
# ============================================================

@serve.deployment(
    name="shared_model_worker",
    num_replicas=1,  # ★ 싱글톤: 반드시 1개
    ray_actor_options={
        "num_gpus": 1,  # GPU 1장 점유
        "num_cpus": 2,
    },
    max_ongoing_requests=32,  # 동시 추론 요청 상한
    health_check_period_s=30,
)
class SharedModelWorker:
    """
    모든 무거운 모델을 GPU에 올려두는 공유 워커.
    
    에이전트들은 이 워커의 handle.remote()를 호출하여 GPU 연산을 위임.
    → 에이전트 자체는 GPU를 점유하지 않음 (num_gpus=0).
    → VRAM에 모델이 중복 로드되지 않음.
    """

    def __init__(self, model_dir: str = "/mnt/efs/models"):
        self.model_dir = Path(model_dir)
        self.device = torch.device(DEVICE)
        self._ready = False

        logger.info(f"Loading models from {model_dir} onto {self.device}...")

        # ── Video Model ──
        self.video_model = self._load_video_model()

        # ── Audio Model (Wav2Vec2) ──
        self.audio_model = self._load_audio_model()

        # ── Sync Model (SyncNet) ──
        self.sync_model = self._load_sync_model()

        self._ready = True
        logger.info("All models loaded successfully")

    # ── Public API: 에이전트들이 호출하는 메서드 ──

    def video_inference(self, frames_np: np.ndarray) -> dict:
        """
        VideoAgent가 호출. Plasma에서 꺼낸 프레임을 받아 추론.
        
        Args:
            frames_np: (T, C, H, W) numpy array
        Returns:
            {"logits": np.ndarray, "features": np.ndarray}
        """
        with torch.inference_mode():
            frames = torch.from_numpy(frames_np).unsqueeze(0).to(self.device)
            logits, features = self.video_model(frames)
            return {
                "logits": logits.cpu().numpy(),
                "features": features.cpu().numpy(),
            }

    def audio_inference(self, audio_np: np.ndarray) -> dict:
        """
        AudioAgent가 호출. Wav2Vec2 특징 추출.
        
        Args:
            audio_np: (samples,) numpy array (16kHz)
        Returns:
            {"features": np.ndarray(768,), "logits": np.ndarray}
        """
        with torch.inference_mode():
            audio = torch.from_numpy(audio_np).unsqueeze(0).to(self.device)
            # Wav2Vec2 feature extraction
            outputs = self.audio_model(audio)
            features = outputs.mean(dim=1)  # 시간 축 평균 → (1, 768)
            return {
                "features": features.cpu().numpy(),
            }

    def sync_inference(self, frames_np: np.ndarray, audio_np: np.ndarray) -> dict:
        """
        SyncAgent가 호출. 립싱크 일치도 계산.
        
        Returns:
            {"sync_score": float}  # 0~1
        """
        with torch.inference_mode():
            # SyncNet은 입술 영역 + 오디오를 받아 일치도 산출
            # 실제 구현은 SyncNet 논문의 forward pass
            sync_score = 0.5  # TODO: 실제 SyncNet 추론
            return {"sync_score": sync_score}

    # ── Health Check ──
    def check_health(self):
        if not self._ready:
            raise RuntimeError("Models not loaded")

    # ── Private: 모델 로드 ──

    def _load_video_model(self) -> VideoModel:
        model = VideoModel(backbone_name="mobilevitv2_100")
        ckpt_path = self.model_dir / "video_backbone.pt"
        if ckpt_path.exists():
            checkpoint = torch.load(ckpt_path, map_location=self.device, weights_only=False)

            # Case 1: torch.save(model.state_dict(), path) — OrderedDict
            if isinstance(checkpoint, dict) and "model_state_dict" not in checkpoint:
                state = checkpoint
            # Case 2: {"model_state_dict": ..., "optimizer": ..., "epoch": ...}
            elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                state = checkpoint["model_state_dict"]
            # Case 3: torch.save(model, path) — 전체 모델 객체
            elif isinstance(checkpoint, nn.Module):
                logger.info("Loaded full model object, extracting state_dict")
                model = checkpoint
                model.to(self.device).eval()
                return model
            else:
                state = checkpoint

            # Key mismatch 허용 (학습 코드와 구조 차이 대응)
            missing, unexpected = model.load_state_dict(state, strict=False)
            if missing:
                logger.warning(f"Missing keys (will use random init): {missing[:5]}...")
            if unexpected:
                logger.warning(f"Unexpected keys (ignored): {unexpected[:5]}...")

            logger.info(f"Video model loaded from {ckpt_path}")
        else:
            logger.warning(f"No checkpoint at {ckpt_path}, using random init")
        model.to(self.device).eval()
        return model

    def _load_audio_model(self):
        """Wav2Vec2 로드. transformers 라이브러리 사용."""
        ckpt_path = self.model_dir / "wav2vec2"
        try:
            from transformers import Wav2Vec2Model
            if ckpt_path.exists():
                model = Wav2Vec2Model.from_pretrained(str(ckpt_path))
            else:
                model = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base-960h")
                logger.warning("Using default wav2vec2 weights")
            model.to(self.device).eval()
            return model
        except ImportError:
            logger.warning("transformers not installed, audio model unavailable")
            return None

    def _load_sync_model(self):
        """SyncNet 로드."""
        ckpt_path = self.model_dir / "syncnet.pt"
        # TODO: SyncNet 구현체 로드
        logger.info("SyncNet placeholder loaded")
        return None
