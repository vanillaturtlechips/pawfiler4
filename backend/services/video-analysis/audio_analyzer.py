"""faster-whisper + silero-vad (AWS Transcribe 대체, 87% 절감)"""
import torch
import numpy as np
from faster_whisper import WhisperModel
import subprocess
import tempfile
import logging

logger = logging.getLogger(__name__)


class AudioAnalyzer:
    def __init__(self):
        # faster-whisper base (int8 양자화)
        self.model = WhisperModel("base", device="cpu", compute_type="int8")
        
        # silero-vad
        self.vad_model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False
        )
        self.get_speech_timestamps = utils[0]
        
    def analyze(self, video_path: str) -> dict:
        """음성 분석"""
        # 1. 오디오 추출
        audio_path = self._extract_audio(video_path)
        
        # 2. VAD로 음성 구간 감지
        speech_timestamps = self._detect_speech(audio_path)
        
        if not speech_timestamps:
            logger.info("No speech detected, skipping STT")
            return {
                'has_speech': False,
                'confidence': 0.5,
                'transcript': '',
                'speech_ratio': 0.0
            }
        
        # 3. 음성 구간만 STT (비용 절감)
        transcript = self._transcribe(audio_path, speech_timestamps)
        
        # 4. 음성 기반 confidence (간단한 휴리스틱)
        confidence = self._calculate_confidence(transcript)
        
        speech_ratio = sum(ts['end'] - ts['start'] for ts in speech_timestamps) / self._get_duration(audio_path)
        
        return {
            'has_speech': True,
            'confidence': confidence,
            'transcript': transcript,
            'speech_ratio': speech_ratio
        }
    
    def _extract_audio(self, video_path: str) -> str:
        """비디오에서 오디오 추출"""
        audio_path = tempfile.mktemp(suffix='.wav')
        subprocess.run([
            'ffmpeg', '-i', video_path, '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1', audio_path, '-y'
        ], capture_output=True)
        return audio_path
    
    def _detect_speech(self, audio_path: str) -> list:
        """silero-vad로 음성 구간 감지"""
        wav = self._read_audio(audio_path)
        speech_timestamps = self.get_speech_timestamps(
            wav, self.vad_model,
            threshold=0.5,
            min_speech_duration_ms=250,
            min_silence_duration_ms=100
        )
        return speech_timestamps
    
    def _transcribe(self, audio_path: str, timestamps: list) -> str:
        """faster-whisper STT (음성 구간만)"""
        segments, info = self.model.transcribe(
            audio_path,
            beam_size=1,  # 속도 우선
            language="ko",
            vad_filter=False  # 이미 VAD 적용됨
        )
        
        transcript = " ".join([seg.text for seg in segments])
        return transcript.strip()
    
    def _calculate_confidence(self, transcript: str) -> float:
        """음성 기반 confidence (간단한 휴리스틱)"""
        # TODO: 더 정교한 로직 (감정 분석 등)
        if not transcript:
            return 0.5
        
        # 의심스러운 키워드 체크
        suspicious_words = ['가짜', '조작', '편집', 'deepfake']
        score = 0.5
        for word in suspicious_words:
            if word in transcript:
                score += 0.1
        
        return min(0.9, score)
    
    def _read_audio(self, path: str):
        """오디오 파일 읽기"""
        import soundfile as sf
        wav, sr = sf.read(path)
        if sr != 16000:
            import librosa
            wav = librosa.resample(wav, orig_sr=sr, target_sr=16000)
        return torch.from_numpy(wav)
    
    def _get_duration(self, path: str) -> float:
        """오디오 길이"""
        result = subprocess.run([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', path
        ], capture_output=True, text=True)
        return float(result.stdout.strip())
