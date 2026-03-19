"""
PawFiler ML Training - Cascade Pipeline
Phase 1: XGBoost (hand-crafted features) → 80% 케이스 처리
Phase 2: MobileViT-v2 + LSTM → 불확실 케이스 정밀 분류
"""
# --- [핵심 수정 1] CPU 스레드 경합 및 데드락(무한 대기) 방지 ---
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
# -------------------------------------------------------------

import io
import pickle
import argparse
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import webdataset as wds
import boto3
import xgboost as xgb
import torch.multiprocessing
torch.multiprocessing.set_sharing_strategy('file_system')
from collections import defaultdict, Counter
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from timm import create_model
from sklearn.metrics import f1_score, recall_score
from scipy.ndimage import convolve
from scipy.fft import dctn

BUCKET    = 'ai-preprocessing'
TRAIN_URL = 'pipe:aws s3 cp s3://ai-preprocessing/webdataset/dataset_{00000..06500}.tar -'
VAL_URL   = 'pipe:aws s3 cp s3://ai-preprocessing/webdataset/dataset_{06501..06998}.tar -'
DEVICE    = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
s3        = boto3.client('s3', region_name='ap-northeast-2')

L1_LAMBDA          = 1e-5
L2_LAMBDA          = 1e-4
DROPOUT            = 0.3
CASCADE_THRESHOLD  = 0.85
FOCAL_GAMMA        = 2.0

AI_MODELS = [
    'AccVideo', 'AnimateDiff', 'Cogvideox1.5', 'EasyAnimate',
    'Gen2', 'Gen3', 'HunyuanVideo', 'IPOC', 'Jimeng', 'LTX',
    'Luma', 'Open-Sora', 'OpenSource_I2V_EasyAnimate', 'OpenSource_I2V_LTX',
    'OpenSource_I2V_Pyramid-Flow', 'OpenSource_I2V_SEINE', 'OpenSource_I2V_SVD',
    'OpenSource_I2V_VideoCrafter', 'OpenSource_V2V_Cogvideox1.5',
    'OpenSource_V2V_LTX', 'Opensora', 'Pyramid-Flow', 'Real',
    'RepVideo', 'SEINE', 'SVD', 'Sora', 'VideoCrafter', 'Wan2.1',
    'causvid_24fps', 'vidu', 'wan', 'real', 'fake', 'audio_fake',
]
LABEL2IDX  = {l: i for i, l in enumerate(AI_MODELS)}
NUM_CLASSES = len(AI_MODELS)

class FocalLoss(nn.Module):
    def __init__(self, gamma=FOCAL_GAMMA):
        super().__init__()
        self.gamma = gamma

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(logits, targets, reduction='none')
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()

def extract_features(frames: np.ndarray) -> np.ndarray:
    feats = []
    lap_kernel = np.array([[0,1,0],[1,-4,1],[0,1,0]], dtype=np.float32)

    for frame in frames:
        gray = frame.mean(axis=-1).astype(np.float32)
        lap_var = convolve(gray, lap_kernel).var()
        ch_stats = [frame[:,:,c].mean() for c in range(3)] + \
                   [frame[:,:,c].std()  for c in range(3)]
        dct = dctn(gray, norm='ortho')
        dct_ratio = (dct[:8,:8]**2).sum() / ((dct**2).sum() + 1e-8)
        feats.append([lap_var, dct_ratio] + ch_stats)

    feats = np.array(feats)
    if len(feats) > 1:
        diff = np.diff(feats, axis=0)
        temporal = np.concatenate([diff.mean(0), diff.std(0)])
    else:
        temporal = np.zeros(16)

    return np.concatenate([feats.mean(0), feats.std(0), temporal])

class VideoAgent(nn.Module):
    def __init__(self, num_classes, dropout=DROPOUT):
        super().__init__()
        self.backbone = create_model('mobilevitv2_100', pretrained=True, num_classes=0)
        self.lstm = nn.LSTM(self.backbone.num_features, 256, batch_first=True, dropout=dropout)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(256, num_classes))

    def forward(self, x):
        B, T, C, H, W = x.shape
        feats = self.backbone(x.view(B*T, C, H, W)).view(B, T, -1)
        _, (h, _) = self.lstm(feats)
        return self.head(h.squeeze(0))

def elastic_net_loss(model, focal_loss):
    l1 = sum(p.abs().sum() for p in model.parameters())
    return focal_loss + L1_LAMBDA * l1

MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3,1,1)
STD  = torch.tensor([0.229, 0.224, 0.225]).view(3,1,1)

def create_decoder(return_frames=True):
    def decode_sample(sample):
        try:
            npz_data = sample.get('npz') or sample.get('npz.gz')
            cls_data = sample.get('cls') or sample.get('txt')
            if npz_data is None or cls_data is None: return None

            if isinstance(cls_data, bytes):
                label_str = cls_data.decode().strip()
            else:
                label_str = str(cls_data).strip()

            label = LABEL2IDX.get(label_str, -1)
            if label == -1: return None

            frames = np.load(io.BytesIO(npz_data) if isinstance(npz_data, bytes) else npz_data)['frames']
            if frames.ndim == 2:
                frames = np.stack([frames]*3, axis=-1)[np.newaxis]
            frames = frames[:32]

            hc = extract_features(frames)

            if not return_frames:
                return hc, torch.empty(0), label

            t = torch.from_numpy(frames).float() / 255.0
            t = (t.permute(0,3,1,2) - MEAN) / STD
            t = F.interpolate(t, size=(224, 224), mode='bilinear', align_corners=False)

            return hc, t, label
        except Exception:
            return None
    return decode_sample

def collate_fn(samples):
    hc, frames_list, labels = zip(*samples)
    if frames_list[0].numel() == 0:
        return np.array(hc), torch.empty(0), torch.tensor(labels)

    max_t  = max(f.shape[0] for f in frames_list)
    padded = torch.zeros(len(frames_list), max_t, 3, 224, 224)
    for i, f in enumerate(frames_list):
        padded[i, :f.shape[0]] = f
    return np.array(hc), padded, torch.tensor(labels)

# --- [핵심 수정 2 & 3] num_workers 축소 및 깨진 파일(handler) 스킵 ---
def make_dataloader(url, batch_size, num_workers=4, shuffle=True, return_frames=True):
    dataset = (
        wds.WebDataset(url, shardshuffle=shuffle, handler=wds.warn_and_continue)
        .map(create_decoder(return_frames))
        .select(lambda x: x is not None)
        .batched(batch_size, collation_fn=collate_fn)
    )
    return wds.WebLoader(dataset, batch_size=None, num_workers=num_workers)

def save_checkpoint(model, optimizer, epoch, step, tag):
    buf = io.BytesIO()
    torch.save({'epoch': epoch, 'step': step,
                'model': model.state_dict(),
                'optimizer': optimizer.state_dict()}, buf)
    buf.seek(0)
    s3.upload_fileobj(buf, BUCKET, f'checkpoints/{tag}_latest.pt')

def load_checkpoint(model, optimizer, tag):
    try:
        obj  = s3.get_object(Bucket=BUCKET, Key=f'checkpoints/{tag}_latest.pt')
        ckpt = torch.load(io.BytesIO(obj['Body'].read()), map_location=DEVICE)
        model.load_state_dict(ckpt['model'])
        optimizer.load_state_dict(ckpt['optimizer'])
        print(f"[체크포인트 로드] epoch={ckpt['epoch']}")
        return ckpt['epoch'], ckpt['step']
    except Exception:
        return 0, 0

def train_phase1(max_samples=200000):
    print("=== Phase 1: XGBoost 학습 시작 ===")
    per_class_limit = max_samples // NUM_CLASSES
    class_buckets   = defaultdict(list)

    loader = make_dataloader(TRAIN_URL, batch_size=64, return_frames=False)
    for hc_feats, _, labels in loader:
        for feat, lbl in zip(hc_feats, labels.numpy()):
            if len(class_buckets[int(lbl)]) < per_class_limit:
                class_buckets[int(lbl)].append(feat)
        total = sum(len(v) for v in class_buckets.values())
        if total >= max_samples: break

    X = np.concatenate([np.array(v) for v in class_buckets.values() if v])
    y = np.concatenate([[k]*len(v) for k, v in class_buckets.items() if v])

    counts  = Counter(y)
    weights = np.array([1.0 / counts[yi] for yi in y])
    weights = weights / weights.sum() * len(weights)

    xgb_model = xgb.XGBClassifier(
        n_estimators=500, max_depth=6, learning_rate=0.1,
        reg_alpha=L1_LAMBDA * 1000, reg_lambda=L2_LAMBDA * 1000,
        use_label_encoder=False, eval_metric='mlogloss',
        device='cuda' if torch.cuda.is_available() else 'cpu',
    )
    xgb_model.fit(X, y, sample_weight=weights)

    print("=== Phase 1: 검증 ===")
    X_val, y_val = [], []
    val_loader = make_dataloader(VAL_URL, batch_size=4, shuffle=False, return_frames=False)
    for hc_feats, _, labels in val_loader:
        X_val.append(hc_feats)
        y_val.extend(labels.numpy().tolist())
        if len(y_val) >= 10000: break
    X_val = np.concatenate(X_val)[:10000]
    y_val = np.array(y_val[:10000])
    preds = xgb_model.predict(X_val)
    print(f"F1(macro)={f1_score(y_val, preds, average='macro'):.4f} "
          f"Recall(macro)={recall_score(y_val, preds, average='macro'):.4f}")

    buf = io.BytesIO()
    pickle.dump(xgb_model, buf)
    buf.seek(0)
    s3.upload_fileobj(buf, BUCKET, 'models/xgboost_phase1.pkl')
    print("Phase 1 완료: s3://ai-preprocessing/models/xgboost_phase1.pkl")
    return xgb_model

def train_phase2(xgb_model, epochs=5, batch_size=4):
    print("=== Phase 2: MobileViT 학습 시작 (Mixed Precision + Gradient Accumulation) ===")
    model     = VideoAgent(NUM_CLASSES).to(DEVICE)
    optimizer = AdamW(model.parameters(), lr=1e-4, weight_decay=L2_LAMBDA)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = FocalLoss()

    # --- [핵심 수정 4] 최신 Mixed Precision 스케일러 (경고문 제거) ---
    scaler = torch.amp.GradScaler('cuda')
    accumulation_steps = max(1, 32 // batch_size)

    start_epoch, global_step = load_checkpoint(model, optimizer, 'cnn')

    for epoch in range(start_epoch, epochs):
        model.train()
        loader = make_dataloader(TRAIN_URL, batch_size)
        total_loss, correct, total = 0.0, 0, 0

        optimizer.zero_grad()

        for step_idx, (hc_feats, frames, labels) in enumerate(loader):
            proba     = xgb_model.predict_proba(hc_feats)
            uncertain = proba.max(axis=1) < CASCADE_THRESHOLD
            if uncertain.sum() == 0: continue

            frames = frames[uncertain].to(DEVICE)
            labels = labels[uncertain].to(DEVICE)

            # --- [핵심 수정 5] 최신 Autocast 문법 적용 (메모리 절반, 경고문 제거) ---
            with torch.amp.autocast('cuda'):
                logits = model(frames)
                loss   = elastic_net_loss(model, criterion(logits, labels))
                loss   = loss / accumulation_steps

            scaler.scale(loss).backward()

            if (global_step + 1) % accumulation_steps == 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            total_loss += loss.item() * accumulation_steps
            correct    += (logits.argmax(1) == labels).sum().item()
            total      += labels.size(0)
            global_step += 1

            if global_step % 200 == 0 and total > 0:
                print(f"epoch={epoch} step={global_step} "
                      f"loss={total_loss/200:.4f} acc={correct/total*100:.2f}% "
                      f"uncertain={uncertain.mean():.2f}")
                total_loss, correct, total = 0.0, 0, 0

            if global_step % 1000 == 0:
                save_checkpoint(model, optimizer, epoch, global_step, 'cnn')

        scheduler.step()
        save_checkpoint(model, optimizer, epoch+1, global_step, 'cnn')

        model.eval()
        all_preds, all_labels = [], []
        val_loader = make_dataloader(VAL_URL, batch_size, shuffle=False)
        with torch.no_grad():
            for _, frames, labels in val_loader:
                with torch.amp.autocast('cuda'):
                    logits = model(frames.to(DEVICE))
                all_preds.extend(logits.argmax(1).cpu().numpy())
                all_labels.extend(labels.numpy())
                if len(all_labels) >= 5000: break
        f1  = f1_score(all_labels, all_preds, average='macro', zero_division=0)
        rec = recall_score(all_labels, all_preds, average='macro', zero_division=0)
        print(f"[Val] epoch={epoch} F1={f1:.4f} Recall={rec:.4f}")

    buf = io.BytesIO()
    torch.save(model.state_dict(), buf)
    buf.seek(0)
    s3.upload_fileobj(buf, BUCKET, 'models/mobilevit_phase2.pt')
    print("Phase 2 완료: s3://ai-preprocessing/models/mobilevit_phase2.pt")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase',      type=int, default=0,  help='0=both, 1=xgboost, 2=cnn')
    parser.add_argument('--epochs',     type=int, default=5)
    parser.add_argument('--batch_size', type=int, default=4)
    args = parser.parse_args()

    if args.phase in (0, 1):
        xgb_model = train_phase1()
    else:
        obj       = s3.get_object(Bucket=BUCKET, Key='models/xgboost_phase1.pkl')
        xgb_model = pickle.load(io.BytesIO(obj['Body'].read()))

    if args.phase in (0, 2):
        train_phase2(xgb_model, args.epochs, args.batch_size)
