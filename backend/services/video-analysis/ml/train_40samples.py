#!/usr/bin/env python3
"""MobileViT v2 학습 - 40개 샘플 (영상 30 + 음성 10)"""
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import cv2
import numpy as np
from PIL import Image
from pathlib import Path
import argparse
from tqdm import tqdm
from timm import create_model


class MultiModalDataset(Dataset):
    """영상(MP4) + 음성(PNG 스펙트로그램) 통합 데이터셋"""
    
    def __init__(self, data_dir, transform=None):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.samples = self._load_samples()
    
    def _load_samples(self):
        samples = []
        
        # celeb_df: 10개 MP4
        for f in (self.data_dir / "celeb_df").glob("*.mp4"):
            label = 1 if "fake" in f.name else 0
            samples.append({"path": f, "label": label, "type": "video"})
        
        # aigvdbench: 10개 MP4
        for f in (self.data_dir / "aigvdbench").glob("*.mp4"):
            label = 1 if "fake" in f.name else 0
            samples.append({"path": f, "label": label, "type": "video"})
        
        # wilddeepfake: 10개 .gz (스킵 가능하면 스킵)
        for f in (self.data_dir / "wilddeepfake").glob("*.gz"):
            label = 1 if "fake" in f.name else 0
            samples.append({"path": f, "label": label, "type": "skip"})
        
        # mlaad: 10개 PNG (스펙트로그램)
        for f in (self.data_dir / "mlaad").glob("*.png"):
            label = 1 if "fake" in f.name else 0
            samples.append({"path": f, "label": label, "type": "spectrogram"})
        
        return samples
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        if sample["type"] == "video":
            # 비디오 → 중간 프레임 추출
            frame = self._extract_video_frame(sample["path"])
        elif sample["type"] == "spectrogram":
            # 스펙트로그램 PNG → RGB 변환
            img = Image.open(sample["path"]).convert('RGB')
            frame = torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0
        else:
            # skip
            frame = torch.zeros(3, 224, 224)
        
        if self.transform:
            frame = self.transform(frame)
        
        return frame, sample["label"]
    
    def _extract_video_frame(self, path):
        """비디오 중간 프레임 추출"""
        cap = cv2.VideoCapture(str(path))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        mid = total // 2
        
        cap.set(cv2.CAP_PROP_POS_FRAMES, mid)
        ret, frame = cap.read()
        cap.release()
        
        if ret:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return torch.from_numpy(frame).permute(2, 0, 1).float() / 255.0
        else:
            return torch.zeros(3, 224, 224)


def train(args):
    device = torch.device("cpu")  # GTX 1060 미지원
    print(f"🚀 Device: CPU")
    print(f"📦 Data: {args.data_dir}")
    
    # 모델
    model = create_model('mobilevitv2_050', pretrained=True, num_classes=2)
    model = model.to(device)
    
    # 데이터
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    dataset = MultiModalDataset(args.data_dir, transform)
    print(f"📊 Total samples: {len(dataset)}")
    
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = torch.utils.data.random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, num_workers=0)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    
    # 학습
    best_acc = 0
    for epoch in range(args.epochs):
        model.train()
        train_loss = 0
        
        for frames, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}"):
            frames, labels = frames.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(frames)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
        
        # 검증
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for frames, labels in val_loader:
                frames, labels = frames.to(device), labels.to(device)
                outputs = model(frames)
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()
        
        acc = 100. * correct / total
        print(f"Epoch {epoch+1}: Loss={train_loss/len(train_loader):.4f}, Val Acc={acc:.2f}%")
        
        if acc > best_acc:
            best_acc = acc
            torch.save(model.state_dict(), f"{args.output_dir}/mobilevit_v2_best.pth")
    
    print(f"\n✅ Best accuracy: {best_acc:.2f}%")
    print(f"📁 Model saved: {args.output_dir}/mobilevit_v2_best.pth")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output-dir", default="./models")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    args = parser.parse_args()
    
    Path(args.output_dir).mkdir(exist_ok=True)
    train(args)
