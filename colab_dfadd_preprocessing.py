"""
Google Colab에서 실행
dfadd 10개 샘플만 전처리 → 스펙트로그램 이미지로 저장
"""

# ============================================
# 1. 환경 설정
# ============================================
!pip install -q datasets librosa pillow

from datasets import load_dataset
import librosa
import numpy as np
from PIL import Image
from scipy.ndimage import zoom
import os

# ============================================
# 2. dfadd 데이터 로드
# ============================================
print("📦 Loading dfadd dataset...")
dataset = load_dataset("isjwdu/dfadd", split="train", streaming=True)

# ============================================
# 3. 10개 샘플 전처리
# ============================================
output_dir = "/content/dfadd_samples"
os.makedirs(output_dir, exist_ok=True)

print("\n🎵 Processing 10 samples...")
fake_count = 0
real_count = 0

for idx, sample in enumerate(dataset):
    if fake_count >= 5 and real_count >= 5:
        break
    
    audio = sample['audio']['array']
    sr = sample['audio']['sampling_rate']
    label = sample['label']
    
    # 레이블 필터링
    if label == 1 and fake_count >= 5:
        continue
    if label == 0 and real_count >= 5:
        continue
    
    # Mel-Spectrogram 변환
    mel_spec = librosa.feature.melspectrogram(
        y=audio, sr=sr, n_mels=128, fmax=8000
    )
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    
    # 224x224로 리사이즈
    factors = (224 / mel_spec_db.shape[0], 224 / mel_spec_db.shape[1])
    mel_spec_resized = zoom(mel_spec_db, factors, order=1)
    
    # 정규화 (0-255)
    mel_spec_norm = ((mel_spec_resized - mel_spec_resized.min()) / 
                     (mel_spec_resized.max() - mel_spec_resized.min()) * 255).astype(np.uint8)
    
    # 이미지로 저장
    label_str = 'fake' if label == 1 else 'real'
    if label == 1:
        filename = f"fake_{fake_count}.png"
        fake_count += 1
    else:
        filename = f"real_{real_count}.png"
        real_count += 1
    
    img = Image.fromarray(mel_spec_norm, mode='L')  # Grayscale
    img.save(os.path.join(output_dir, filename))
    print(f"  ✅ {filename}")

print(f"\n✅ Processed {fake_count + real_count} samples (real: {real_count}, fake: {fake_count})")

# ============================================
# 4. 다운로드
# ============================================
print("\n📦 Creating zip file...")
!zip -r dfadd_samples.zip {output_dir}

print("\n✅ Done! Download 'dfadd_samples.zip'")
print("📥 Extract to: /media/user/.../preprocessed_samples/dfadd/")
