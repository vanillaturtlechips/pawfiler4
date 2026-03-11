import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import timm
import cv2
import numpy as np
from pathlib import Path
from tqdm import tqdm
import gzip

class VideoDataset(Dataset):
    def __init__(self, data_dir, transform=None):
        self.samples = []
        self.transform = transform
        
        for dataset_dir in Path(data_dir).iterdir():
            if not dataset_dir.is_dir():
                continue
            for file in dataset_dir.iterdir():
                if file.suffix in ['.mp4', '.png', '.jpg', '.jpeg', '.gz']:
                    label = 1 if "fake" in file.name else 0
                    self.samples.append((str(file), label, file.suffix))
        
        print(f"Loaded {len(self.samples)} samples")
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        file_path, label, ext = self.samples[idx]
        
        if ext == '.gz':
            import tarfile
            with tarfile.open(file_path, 'r') as tar:
                for member in tar.getmembers():
                    if member.name.endswith('.png') or member.name.endswith('.jpg'):
                        f = tar.extractfile(member)
                        if f:
                            frame = cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_COLOR)
                            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            break
                else:
                    frame = np.zeros((224, 224, 3), dtype=np.uint8)
        elif ext in ['.png', '.jpg', '.jpeg']:
            frame = cv2.imread(file_path)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        else:  # .mp4
            cap = cv2.VideoCapture(file_path)
            frames = []
            while len(frames) < 16:
                ret, f = cap.read()
                if not ret:
                    break
                frames.append(f)
            cap.release()
            
            if len(frames) == 0:
                frame = np.zeros((224, 224, 3), dtype=np.uint8)
            else:
                frame = cv2.cvtColor(frames[len(frames)//2], cv2.COLOR_BGR2RGB)
        
        if self.transform:
            frame = self.transform(frame)
        
        return frame, label

def train():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((256, 256)),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    dataset = VideoDataset('/mnt/c/Users/DS6/Downloads/preprocessed_samples', transform=transform)
    train_loader = DataLoader(dataset, batch_size=4, shuffle=True, num_workers=0)
    
    model = timm.create_model('mobilevitv2_050', pretrained=True, num_classes=2)
    model = model.to(device)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0001)
    
    epochs = 20
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        correct = 0
        total = 0
        
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}")
        for images, labels in pbar:
            images, labels = images.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
            
            pbar.set_postfix({'loss': f'{total_loss/total:.4f}', 'acc': f'{100.*correct/total:.2f}%'})
    
    torch.save(model.state_dict(), 'ml/models/mobilevit_v2_best.pth')
    print("Model saved to ml/models/mobilevit_v2_best.pth")

if __name__ == '__main__':
    train()
