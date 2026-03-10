#!/usr/bin/env python3
"""MobileViT v2 학습 - 로컬/Spot 인스턴스용"""
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import cv2
import numpy as np
import os
import json
from pathlib import Path
import argparse
from tqdm import tqdm
import tarfile

# MobileViT v2 (timm 사용 - 사전학습 모델 활용)
from timm import create_model


class DeepfakeDataset(Dataset):
    def __init__(self, data_dir, transform=None, max_frames=8):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.max_frames = max_frames
        self.samples = self._load_samples()
    
    def _load_samples(self):
        samples = []
        
        # celeb_df: mp4 파일 (영상 딥페이크)
        celeb_dir = self.data_dir / "celeb_df"
        if celeb_dir.exists():
            for f in celeb_dir.glob("*.mp4"):
                label = 1 if "fake" in f.name else 0
                samples.append({"path": f, "label": label, "type": "video"})
        
        # aigvdbench: mp4 파일 (AI 생성 영상)
        aigvd_dir = self.data_dir / "aigvdbench"
        if aigvd_dir.exists():
            for f in aigvd_dir.glob("*.mp4"):
                label = 1 if "fake" in f.name else 0
                samples.append({"path": f, "label": label, "type": "video"})
        
        # mlaad: 스펙트로그램 이미지 (음성 딥페이크)
        mlaad_dir = self.data_dir / "mlaad"
        if mlaad_dir.exists():
            for f in mlaad_dir.glob("*.png"):
                label = 1 if "fake" in f.name else 0
                samples.append({"path": f, "label": label, "type": "spectrogram"})
        
        # wilddeepfake: .gz 파일 (특수 포맷, 스킵)
        
        return samples
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        if sample["type"] == "video":
            frames = self._extract_video_frames(sample["path"])
            if len(frames) > 0:
                frame = frames[len(frames)//2]
            else:
                frame = torch.zeros(3, 224, 224)
        elif sample["type"] == "spectrogram":
            # 스펙트로그램 이미지 로드
            from PIL import Image
            img = Image.open(sample["path"]).convert('RGB')
            frame = torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0
        else:
            frame = torch.zeros(3, 224, 224)
        
        if self.transform:
            frame = self.transform(frame)
        
        return frame, sample["label"]
    
    def _extract_video_frames(self, path):
        cap = cv2.VideoCapture(str(path))
        frames = []
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        step = max(1, total // self.max_frames)
        
        idx = 0
        while cap.isOpened() and len(frames) < self.max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % step == 0:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(torch.from_numpy(frame).permute(2, 0, 1).float() / 255.0)
            idx += 1
        cap.release()
        return frames
    
    def _extract_tar_frames(self, path):
        # wilddeepfake는 특수 포맷이라 스킵
        return []
    
    def _load_spectrogram(self, path):
        """스펙트로그램 이미지 로드"""
        from PIL import Image
        img = Image.open(path).convert('RGB')
        return torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0


def train(args):
    # GTX 1060 (CUDA 6.1)은 PyTorch 2.10에서 미지원 → CPU 사용
    if args.force_cpu or (torch.cuda.is_available() and 
                          torch.cuda.get_device_capability()[0] < 7):
        print("⚠️  GPU not supported or force_cpu=True, using CPU")
        device = torch.device("cpu")
    else:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True
        torch.cuda.empty_cache()
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        mem_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"Memory: {mem_gb:.1f} GB")
    else:
        print(f"Using CPU (samples: {args.data_dir})")
    
    # MobileViT v2 (사전학습 모델)
    model = create_model('mobilevitv2_050', pretrained=True, num_classes=2)
    model = model.to(device)
    
    # 데이터 로더
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    dataset = DeepfakeDataset(args.data_dir, transform)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = torch.utils.data.random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, 
                             num_workers=args.num_workers, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, 
                           num_workers=args.num_workers, pin_memory=True)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    
    # Mixed Precision (CPU는 미지원)
    scaler = None
    if device.type == "cuda":
        scaler = torch.amp.GradScaler('cuda')
    
    # 학습
    best_acc = 0
    for epoch in range(args.epochs):
        model.train()
        train_loss = 0
        for frames, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}"):
            frames, labels = frames.to(device), labels.to(device)
            
            optimizer.zero_grad()
            
            # Mixed precision (GPU만)
            if scaler:
                with torch.amp.autocast('cuda'):
                    outputs = model(frames)
                    loss = criterion(outputs, labels)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            else:
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
    
    # ONNX 변환 (추론 최적화)
    model.eval()
    dummy_input = torch.randn(1, 3, 224, 224).to(device)
    torch.onnx.export(model, dummy_input, f"{args.output_dir}/mobilevit_v2.onnx",
                      input_names=['input'], output_names=['output'],
                      dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}})
    
    print(f"Best accuracy: {best_acc:.2f}%")
    print(f"Model saved to {args.output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="/media/user/eb0a27dd-868a-4423-9f75-a9a61440d1f4/preprocessed_samples")
    parser.add_argument("--output-dir", default="./models")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=2)
    parser.add_argument("--force-cpu", action="store_true", help="Force CPU training")
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    train(args)
