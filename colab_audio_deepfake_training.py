"""
Google Colab에서 실행
무료 T4 GPU로 dfadd 음성 딥페이크 학습
"""

# ============================================
# 1. 환경 설정
# ============================================
!pip install -q datasets librosa torch torchvision timm

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from datasets import load_dataset
import librosa
import numpy as np
from tqdm import tqdm
from timm import create_model

# ============================================
# 2. dfadd 데이터 로드 (스트리밍)
# ============================================
print("📦 Loading dfadd dataset...")
dataset = load_dataset(
    "isjwdu/dfadd",
    split="train",
    streaming=True  # 메모리 절약
)

# ============================================
# 3. 스펙트로그램 변환 Dataset
# ============================================
class AudioSpectrogramDataset(Dataset):
    def __init__(self, hf_dataset, max_samples=1000):
        self.samples = []
        print("🎵 Converting to spectrograms...")
        
        for idx, sample in enumerate(hf_dataset):
            if idx >= max_samples:
                break
            
            audio = sample['audio']['array']
            sr = sample['audio']['sampling_rate']
            label = sample['label']
            
            # Mel-Spectrogram 변환 (2D 이미지)
            mel_spec = librosa.feature.melspectrogram(
                y=audio, sr=sr, n_mels=128, fmax=8000
            )
            mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
            
            # 224x224로 리사이즈 (MobileNet 입력)
            mel_spec_resized = self._resize(mel_spec_db, (224, 224))
            
            self.samples.append({
                'spectrogram': mel_spec_resized,
                'label': label
            })
            
            if idx % 100 == 0:
                print(f"  Processed {idx} samples...")
    
    def _resize(self, spec, target_shape):
        from scipy.ndimage import zoom
        factors = (target_shape[0] / spec.shape[0], 
                   target_shape[1] / spec.shape[1])
        return zoom(spec, factors, order=1)
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        # 3채널로 변환 (RGB처럼)
        spec = np.stack([sample['spectrogram']] * 3, axis=0)
        spec = torch.from_numpy(spec).float()
        # 정규화
        spec = (spec - spec.mean()) / (spec.std() + 1e-8)
        return spec, sample['label']

# ============================================
# 4. 경량 모델 (MobileNetV3)
# ============================================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🚀 Device: {device}")

# MobileNetV3 Small (5.4M 파라미터)
model = create_model('mobilenetv3_small_100', pretrained=True, num_classes=2)
model = model.to(device)

# ============================================
# 5. 학습
# ============================================
# 데이터셋 생성 (1000개만 샘플링)
train_dataset = AudioSpectrogramDataset(dataset, max_samples=1000)
train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

print("\n🔥 Training...")
model.train()
for epoch in range(5):
    total_loss = 0
    correct = 0
    total = 0
    
    for specs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}"):
        specs, labels = specs.to(device), labels.to(device)
        
        optimizer.zero_grad()
        outputs = model(specs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()
    
    acc = 100. * correct / total
    print(f"Epoch {epoch+1}: Loss={total_loss/len(train_loader):.4f}, Acc={acc:.2f}%")

# ============================================
# 6. 모델 저장
# ============================================
torch.save(model.state_dict(), 'audio_deepfake_mobilenet.pth')
print("\n✅ Model saved: audio_deepfake_mobilenet.pth")
print("📥 Download and use in your pipeline!")

# ============================================
# 7. 추론 예시
# ============================================
def detect_audio_deepfake(audio_path):
    """음성 딥페이크 탐지"""
    # 오디오 로드
    audio, sr = librosa.load(audio_path, sr=16000)
    
    # 스펙트로그램 변환
    mel_spec = librosa.feature.melspectrogram(y=audio, sr=sr, n_mels=128)
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    
    # 리사이즈 & 정규화
    from scipy.ndimage import zoom
    factors = (224 / mel_spec_db.shape[0], 224 / mel_spec_db.shape[1])
    mel_spec_resized = zoom(mel_spec_db, factors, order=1)
    
    spec = np.stack([mel_spec_resized] * 3, axis=0)
    spec = torch.from_numpy(spec).float().unsqueeze(0)
    spec = (spec - spec.mean()) / (spec.std() + 1e-8)
    
    # 추론
    model.eval()
    with torch.no_grad():
        output = model(spec.to(device))
        prob = torch.softmax(output, dim=1)
        is_fake = prob[0][1].item() > 0.5
    
    return {
        'is_fake': is_fake,
        'confidence': prob[0][1].item()
    }

print("\n🎯 Usage:")
print("result = detect_audio_deepfake('audio.wav')")
print("print(result)  # {'is_fake': True, 'confidence': 0.87}")
