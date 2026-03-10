"""로컬 테스트용 딥페이크 탐지기 (학습된 모델 사용)"""
import cv2
import torch
import numpy as np
from timm import create_model
from torchvision import transforms
import logging
import time
from typing import Dict, List

logger = logging.getLogger(__name__)


class LocalDeepfakeDetector:
    """로컬 학습 모델 사용"""
    
    def __init__(self, model_path="ml/models/mobilevit_v2_best.pth"):
        self.device = torch.device("cpu")  # GTX 1060 미지원
        self.model = create_model('mobilevitv2_050', pretrained=False, num_classes=2)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()
        
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        
        logger.info("✅ Local model loaded")
    
    async def analyze(self, video_path: str) -> Dict:
        """비디오 분석"""
        start_time = time.time()
        
        # 프레임 추출
        frames = self._extract_frames(video_path)
        logger.info(f"Extracted {len(frames)} frames")
        
        # 분석
        predictions = []
        with torch.no_grad():
            for frame in frames:
                tensor = self.transform(frame).unsqueeze(0).to(self.device)
                output = self.model(tensor)
                prob = torch.softmax(output, dim=1)
                predictions.append(prob[0].cpu().numpy())
        
        # 평균 confidence
        avg_pred = np.mean(predictions, axis=0)
        fake_confidence = float(avg_pred[1])
        verdict = "fake" if fake_confidence > 0.5 else "real"
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return {
            "verdict": verdict,
            "confidence_score": fake_confidence,
            "manipulated_regions": [],
            "frame_samples_analyzed": len(frames),
            "model_version": "v1.0.0-local",
            "processing_time_ms": processing_time,
            "processing_stage": "video_only"
        }
    
    def _extract_frames(self, video_path: str, max_frames: int = 16) -> List[np.ndarray]:
        """프레임 추출"""
        cap = cv2.VideoCapture(video_path)
        frames = []
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        step = max(1, total // max_frames)
        
        idx = 0
        while cap.isOpened() and len(frames) < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % step == 0:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(frame)
            idx += 1
        
        cap.release()
        return frames


# Alias for MCP server compatibility
LocalDetector = LocalDeepfakeDetector
