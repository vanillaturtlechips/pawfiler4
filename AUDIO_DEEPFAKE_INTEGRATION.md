# 음성 딥페이크 탐지 추가 (비용 $0)

## 전략

**핵심: Colab 무료 GPU + 경량 모델 + 기존 인프라 재사용**

### 1. 학습 (비용: $0)
- Google Colab 무료 T4 GPU
- dfadd Arrow 파일 스트리밍 로드
- 스펙트로그램 변환 (2D 이미지)
- MobileNetV3 Small (5.4M 파라미터)
- 학습 시간: 1-2시간

### 2. 추론 (추가 비용: $0)
- 기존 faster-whisper 인스턴스 재사용
- CPU 추론 (경량 모델)
- Cascade 2단계에 통합

## 비용 비교

| 방안 | 학습 | 운영 (월) |
|------|------|-----------|
| WavLM 별도 | $10-20 | $85 |
| **스펙트로그램 + MobileNet** | **$0** | **$56** |

**절감: 학습 $20, 운영 $29/월**

## 실행 방법

### Step 1: Colab에서 학습
```python
# colab_audio_deepfake_training.py를 Colab에 복사
# 실행 → audio_deepfake_mobilenet.pth 다운로드
```

### Step 2: 모델 배포
```bash
# 모델 파일 복사
cp audio_deepfake_mobilenet.pth backend/services/video-analysis/ml/models/

# 의존성 추가
pip install librosa scipy
```

### Step 3: Cascade 통합
```python
# audio_deepfake_detector.py 사용
# cascade_detector.py에서 import
```

## 결과

```python
# 영상 + 음성 딥페이크 모두 탐지
result = {
    'video_deepfake': True,      # 영상 조작
    'audio_deepfake': False,     # 음성 진짜
    'verdict': 'fake',
    'confidence': 0.87
}
```

## 장점

✅ 학습 비용: $0 (Colab 무료)
✅ 운영 비용: $0 추가 (기존 인프라 재사용)
✅ 경량: MobileNetV3 (5.4M vs WavLM 94M)
✅ 빠름: CPU 추론 가능
✅ 정확: 스펙트로그램은 음성 딥페이크 탐지에 효과적

## 다음 단계

1. Colab에서 `colab_audio_deepfake_training.py` 실행
2. 모델 다운로드
3. `audio_deepfake_detector.py` 통합
4. 테스트!
