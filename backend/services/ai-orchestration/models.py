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

from typing import Optional

# ── 상수 ──
NUM_CLASSES = 35  # AIGVDBench 23종 + real/fake/audio_fake + 여유
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ============================================================
# SyncNet (립싱크 일치도)
# ============================================================

# ============================================================
# SyncNet (원본 아키텍처 — Chung et al. 2017)
# https://github.com/joonson/syncnet_python
# ============================================================

class SyncNet(nn.Module):
    """
    원본 SyncNet 아키텍처.
    입술 영역 5프레임(grayscale) + 오디오 MFCC 20프레임을 각각 인코딩 후
    L2 distance → confidence score 반환.

    입력:
        frames: (B, 1, 5, 112, 112) — 입술 영역 grayscale 5프레임 (채널 축에 T 합침)
        mfcc:   (B, 1, 20, 13)      — MFCC 20프레임
    출력:
        score: (B,) — 0~1 (높을수록 립싱크 일치)
    """

    def __init__(self):
        super().__init__()
        # 영상 인코더
        self.video_encoder = nn.Sequential(
            nn.Conv3d(1, 96, (5, 7, 7), stride=(1, 2, 2), padding=0), nn.BatchNorm3d(96), nn.ReLU(),
            nn.MaxPool3d((1, 3, 3), stride=(1, 2, 2)),
            nn.Conv3d(96, 256, (1, 5, 5), stride=(1, 2, 2), padding=(0, 1, 1)), nn.BatchNorm3d(256), nn.ReLU(),
            nn.MaxPool3d((1, 3, 3), stride=(1, 2, 2)),
            nn.Conv3d(256, 256, (1, 3, 3), padding=(0, 1, 1)), nn.BatchNorm3d(256), nn.ReLU(),
            nn.Conv3d(256, 256, (1, 3, 3), padding=(0, 1, 1)), nn.BatchNorm3d(256), nn.ReLU(),
            nn.Conv3d(256, 256, (1, 3, 3), padding=(0, 1, 1)), nn.BatchNorm3d(256), nn.ReLU(),
            nn.MaxPool3d((1, 3, 3), stride=(1, 2, 2)),
            nn.Conv3d(256, 512, (1, 6, 6), padding=0), nn.BatchNorm3d(512), nn.ReLU(),
        )
        self.video_fc = nn.Sequential(nn.Linear(512, 512), nn.BatchNorm1d(512))

        # 오디오 인코더
        self.audio_encoder = nn.Sequential(
            nn.Conv2d(1, 96, (3, 7), stride=(1, 2), padding=0), nn.BatchNorm2d(96), nn.ReLU(),
            nn.MaxPool2d((3, 1), stride=(2, 1)),
            nn.Conv2d(96, 256, (3, 5), stride=(2, 1), padding=(1, 1)), nn.BatchNorm2d(256), nn.ReLU(),
            nn.MaxPool2d((3, 1), stride=(2, 1)),
            nn.Conv2d(256, 256, (3, 3), padding=(1, 1)), nn.BatchNorm2d(256), nn.ReLU(),
            nn.Conv2d(256, 256, (3, 3), padding=(1, 1)), nn.BatchNorm2d(256), nn.ReLU(),
            nn.Conv2d(256, 256, (3, 3), padding=(1, 1)), nn.BatchNorm2d(256), nn.ReLU(),
            nn.MaxPool2d((3, 1), stride=(2, 1)),
            nn.Conv2d(256, 512, (4, 1), padding=0), nn.BatchNorm2d(512), nn.ReLU(),
        )
        self.audio_fc = nn.Sequential(nn.Linear(512, 512), nn.BatchNorm1d(512))

    def forward(self, frames: torch.Tensor, mfcc: torch.Tensor) -> torch.Tensor:
        """
        frames: (B, 1, 5, 112, 112)
        mfcc:   (B, 1, 20, 13)
        """
        v = self.video_encoder(frames).squeeze(-1).squeeze(-1).squeeze(-1)  # (B, 512)
        v = self.video_fc(v)

        a = self.audio_encoder(mfcc).squeeze(-1).squeeze(-1)  # (B, 512)
        a = self.audio_fc(a)

        # L2 distance → confidence (원본 방식)
        dist = torch.nn.functional.pairwise_distance(v, a)
        score = torch.exp(-dist)  # 가까울수록 1에 가까움
        return score.clamp(0, 1)


# ============================================================
# VideoAgent 코어 모델 (Backbone + LSTM + Head)
# ============================================================

class VideoModel(nn.Module):
    """
    VideoAgent 아키텍처 (2026-03-26 업데이트)
    tf_efficientnet_b4 → LSTM(512) → Head(512→256→NUM_CLASSES)

    입력: (B, T, C, H, W) — T개 프레임의 배치
    출력: (B, NUM_CLASSES) logits + (B, 256) features
    """

    def __init__(self, backbone_name: str = "tf_efficientnet_b4", lstm_hidden: int = 512):
        super().__init__()
        import timm
        self.backbone = timm.create_model(backbone_name, pretrained=False, num_classes=0)
        backbone_out = self.backbone.num_features  # tf_efficientnet_b4: 1792

        self.lstm = nn.LSTM(backbone_out, lstm_hidden, num_layers=1, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(lstm_hidden, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, NUM_CLASSES),
        )
        self.feature_dim = 256

    def forward(self, frames: torch.Tensor):
        """
        Args:
            frames: (B, T, C, H, W)
        Returns:
            logits: (B, NUM_CLASSES)
            features: (B, 256) — Fusion에서 사용
        """
        B, T, C, H, W = frames.shape
        x = frames.view(B * T, C, H, W)
        feats = self.backbone(x).view(B, T, -1)

        _, (h, _) = self.lstm(feats)
        h = h.squeeze(0)  # (B, lstm_hidden)

        logits = self.head(h)
        features = self.head[:-1](h) if hasattr(self.head, '__iter__') else h  # Linear(512,256) 출력
        return logits, features


# ============================================================
# SharedModelWorker (GPU 싱글톤 Deployment)
# ============================================================

@serve.deployment(
    name="shared_model_worker",
    num_replicas=1,  # ★ 싱글톤: 반드시 1개
    ray_actor_options={
        "num_gpus": 1,  # GPU 1장 점유
        "num_cpus": 1,
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

    def __init__(self, model_dir: str = "/mnt/efs/models/models"):
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

        원본 SyncNet 입력 포맷으로 변환:
            frames_np: (T, C, H, W) → 입술 영역 crop → (1, 1, 5, 112, 112)
            audio_np:  (samples,)   → MFCC 추출     → (1, 1, 20, 13)

        Returns:
            {"sync_score": float}  # 0~1, 높을수록 일치
        """
        import librosa
        with torch.inference_mode():
            # ── 영상: 중앙 하단 입술 영역 crop, grayscale, 5프레임 ──
            T = frames_np.shape[0]
            indices = np.linspace(0, T - 1, 5, dtype=int)
            lips = []
            for i in indices:
                frame = frames_np[i]  # (C, H, W)
                gray = (frame[0] * 0.299 + frame[1] * 0.587 + frame[2] * 0.114)  # (H, W)
                import cv2
                h, w = gray.shape
                lip = gray[h // 2:, w // 4: 3 * w // 4]  # 하단 중앙 크롭
                lip = cv2.resize(lip, (112, 112))
                lips.append(lip)
            # (1, 1, 5, 112, 112)
            lip_tensor = torch.from_numpy(
                np.stack(lips)[np.newaxis, np.newaxis].astype(np.float32)
            ).to(self.device)

            # ── 오디오: MFCC (1, 1, 20, 13) ──
            mfcc = librosa.feature.mfcc(y=audio_np, sr=16000, n_mfcc=13, n_fft=512, hop_length=160)
            # mfcc: (13, T_frames) → 20프레임 균등 샘플링 → (20, 13)
            t_frames = mfcc.shape[1]
            idx = np.linspace(0, t_frames - 1, 20, dtype=int)
            mfcc_sampled = mfcc[:, idx].T  # (20, 13)
            mfcc_tensor = torch.from_numpy(
                mfcc_sampled[np.newaxis, np.newaxis].astype(np.float32)
            ).to(self.device)  # (1, 1, 20, 13)

            score = self.sync_model(lip_tensor, mfcc_tensor)
            return {"sync_score": float(score.item())}

    # ── Health Check ──
    def check_health(self):
        if not self._ready:
            raise RuntimeError("Models not loaded")

    # ── Private: 모델 로드 ──

    def _load_video_model(self) -> VideoModel:
        model = VideoModel(backbone_name="tf_efficientnet_b4", lstm_hidden=512)
        ckpt_path = self.model_dir / "video_backbone.pt"
        if ckpt_path.exists():
            checkpoint = torch.load(ckpt_path, map_location=self.device, weights_only=False)

            # Case 1: torch.save(model.state_dict(), path) — OrderedDict
            if isinstance(checkpoint, dict) and "model_state_dict" not in checkpoint:
                state = checkpoint
            # Case 2: {"model_state_dict": ..., "optimizer": ..., "epoch": ...}
            elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                state = checkpoint["model_state_dict"]
            # Case 3-a: {"model": ..., "optimizer": ..., "epoch": ...} (train3.py 저장 포맷)
            elif isinstance(checkpoint, dict) and "model" in checkpoint:
                state = checkpoint["model"]
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

    def _load_sync_model(self) -> "SyncNet":
        """SyncNet 원본 pretrained 가중치 로드."""
        import urllib.request
        SYNCNET_URL = "https://www.robots.ox.ac.uk/~vgg/software/lipsync/data/syncnet_v2.model"
        ckpt_path = self.model_dir / "syncnet.pt"

        # EFS read-only면 /tmp로 fallback
        if not ckpt_path.exists():
            tmp_path = Path("/tmp/syncnet.pt")
            if not tmp_path.exists():
                logger.info("Downloading SyncNet pretrained weights...")
                try:
                    urllib.request.urlretrieve(SYNCNET_URL, ckpt_path)
                except OSError:
                    urllib.request.urlretrieve(SYNCNET_URL, tmp_path)
                    ckpt_path = tmp_path
            else:
                ckpt_path = tmp_path

        model = SyncNet()
        state = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state, strict=False)
        model.to(self.device).eval()
        logger.info("SyncNet loaded")
        return model
