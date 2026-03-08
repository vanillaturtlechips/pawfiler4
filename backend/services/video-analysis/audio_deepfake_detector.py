"""
기존 Cascade에 음성 딥페이크 탐지 통합
추가 비용: $0 (faster-whisper와 같은 인스턴스 사용)
"""
import torch
import librosa
import numpy as np
from timm import create_model
from scipy.ndimage import zoom

class AudioDeepfakeDetector:
    """경량 음성 딥페이크 탐지 (MobileNetV3)"""
    
    def __init__(self, model_path="audio_deepfake_mobilenet.pth"):
        self.device = torch.device("cpu")  # CPU로 충분
        self.model = create_model('mobilenetv3_small_100', pretrained=False, num_classes=2)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()
    
    def detect(self, audio_path: str) -> dict:
        """음성 딥페이크 탐지"""
        # 오디오 로드
        audio, sr = librosa.load(audio_path, sr=16000)
        
        # 스펙트로그램 변환
        mel_spec = librosa.feature.melspectrogram(y=audio, sr=sr, n_mels=128, fmax=8000)
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # 224x224 리사이즈
        factors = (224 / mel_spec_db.shape[0], 224 / mel_spec_db.shape[1])
        mel_spec_resized = zoom(mel_spec_db, factors, order=1)
        
        # 3채널 변환 & 정규화
        spec = np.stack([mel_spec_resized] * 3, axis=0)
        spec = torch.from_numpy(spec).float().unsqueeze(0)
        spec = (spec - spec.mean()) / (spec.std() + 1e-8)
        
        # 추론
        with torch.no_grad():
            output = self.model(spec.to(self.device))
            prob = torch.softmax(output, dim=1)
            fake_prob = prob[0][1].item()
        
        return {
            'is_fake': fake_prob > 0.5,
            'confidence': fake_prob
        }


# ============================================
# Cascade에 통합
# ============================================
class CascadeDeepfakeDetector:
    def __init__(self):
        self.video_detector = LocalDeepfakeDetector()
        self.audio_detector = AudioDeepfakeDetector()  # 추가!
    
    async def _analyze_audio(self, video_path: str) -> dict:
        """음성 분석 (STT + 딥페이크 체크)"""
        # 오디오 추출
        audio_path = self._extract_audio(video_path)
        
        # 1. STT (기존)
        from audio_analyzer import AudioAnalyzer
        analyzer = AudioAnalyzer()
        stt_result = analyzer.analyze(audio_path)
        
        # 2. 딥페이크 체크 (추가, 같은 오디오 재사용!)
        deepfake_result = self.audio_detector.detect(audio_path)
        
        return {
            'has_speech': stt_result['has_speech'],
            'transcript': stt_result['transcript'],
            'audio_deepfake': deepfake_result['is_fake'],  # 추가!
            'audio_confidence': deepfake_result['confidence'],  # 추가!
            'confidence': stt_result['confidence']
        }
    
    def _extract_audio(self, video_path: str) -> str:
        """비디오에서 오디오 추출"""
        import subprocess
        import tempfile
        audio_path = tempfile.mktemp(suffix='.wav')
        subprocess.run([
            'ffmpeg', '-i', video_path, '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1', audio_path, '-y', '-loglevel', 'quiet'
        ])
        return audio_path
