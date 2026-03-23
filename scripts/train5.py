"""
PawFiler ML Training - SageMaker Entry Point (FastFile Mode)
Phase 2: Target Fine-Tuning (Real vs CogVideo vs LTX)
"""
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
import io
import glob
import pickle
import argparse
import time
import numpy as np
import torch
import torch.nn as nn
import webdataset as wds
import boto3
import xgboost as xgb
import cv2
cv2.setNumThreads(0)
import torch.multiprocessing
torch.multiprocessing.set_sharing_strategy('file_system')
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from timm import create_model
from sklearn.metrics import f1_score

SM_MODEL_DIR      = os.environ.get('SM_MODEL_DIR', './models')
SM_CHECKPOINT_DIR = os.environ.get('SM_CHECKPOINT_DIR', '/opt/ml/checkpoints')
SM_NUM_GPUS       = int(os.environ.get('SM_NUM_GPUS', torch.cuda.device_count()))
SM_CHANNEL_TRAIN  = os.environ.get('SM_CHANNEL_TRAIN', '/opt/ml/input/data/train')

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
BUCKET = 'ai-preprocessing'
s3     = boto3.client('s3', region_name='ap-northeast-2')

AI_MODELS = [
    'AccVideo', 'AnimateDiff', 'Cogvideox1.5', 'EasyAnimate',
    'Gen2', 'Gen3', 'HunyuanVideo', 'IPOC', 'Jimeng', 'LTX',
    'Luma', 'Open-Sora', 'OpenSource_I2V_EasyAnimate', 'OpenSource_I2V_LTX',
    'OpenSource_I2V_Pyramid-Flow', 'OpenSource_I2V_SEINE', 'OpenSource_I2V_SVD',
    'OpenSource_I2V_VideoCrafter', 'OpenSource_V2V_Cogvideox1.5',
    'OpenSource_V2V_LTX', 'Opensora', 'Pyramid-Flow', 'Real',
    'RepVideo', 'SEINE', 'SVD', 'Sora', 'VideoCrafter', 'Wan2.1',
    'causvid_24fps', 'vidu', 'wan', 'real', 'fake',
]
LABEL2IDX   = {l: i for i, l in enumerate(AI_MODELS)}
NUM_CLASSES = len(AI_MODELS)

TARGET_CLASSES = ['Real', 'OpenSource_V2V_Cogvideox1.5', 'OpenSource_V2V_LTX']
TARGET_IDX = [LABEL2IDX[c] for c in TARGET_CLASSES if c in LABEL2IDX]

class FocalLoss(nn.Module):
    def __init__(self, gamma, smoothing, class_weights=None):
        super().__init__()
        self.gamma = gamma
        self.smoothing = smoothing
        self.class_weights = class_weights

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(logits, targets, reduction='none', label_smoothing=self.smoothing)
        pt = torch.exp(-ce)
        focal_loss = (1 - pt) ** self.gamma * ce
        if self.class_weights is not None:
            focal_loss = focal_loss * self.class_weights[targets]
        return focal_loss.mean()

LAP_KERNEL = np.array([[0,1,0],[1,-4,1],[0,1,0]], dtype=np.float32)

def extract_features(frames: np.ndarray) -> np.ndarray:
    feats = []
    for frame in frames:
        gray = frame.mean(axis=-1).astype(np.float32)
        lap_var = cv2.filter2D(gray, -1, LAP_KERNEL).var()
        ch_stats = [frame[:,:,c].mean() for c in range(3)] + [frame[:,:,c].std() for c in range(3)]
        dct = cv2.dct(gray)
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
    def __init__(self, num_classes, dropout, backbone_name='efficientnet_b4'):
        super().__init__()
        self.backbone = create_model(backbone_name, pretrained=False, num_classes=0)
        self.lstm = nn.LSTM(self.backbone.num_features, 256, batch_first=True, dropout=dropout)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(256, num_classes))

    def forward(self, x):
        B, T, C, H, W = x.shape
        feats = self.backbone(x.view(B*T, C, H, W)).view(B, T, -1)
        _, (h, _) = self.lstm(feats)
        return self.head(h.squeeze(0))

MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3,1,1)
STD  = torch.tensor([0.229, 0.224, 0.225]).view(3,1,1)

def create_decoder():
    def decode_sample(sample):
        try:
            npz_data = sample.get('npz') or sample.get('npz.gz')
            cls_data = sample.get('cls') or sample.get('txt')
            if npz_data is None or cls_data is None: return None
            label_str = cls_data.decode().strip() if isinstance(cls_data, bytes) else str(cls_data).strip()
            label = LABEL2IDX.get(label_str, -1)
            if label == -1: return None
            if label not in TARGET_IDX:
                return None
            buffer = io.BytesIO(npz_data) if isinstance(npz_data, bytes) else npz_data
            with np.load(buffer) as data:
                frames = data['frames']
            if frames.ndim == 2: frames = np.stack([frames]*3, axis=-1)[np.newaxis]
            frames = frames[:16]
            resized = np.stack([cv2.resize(f, (224, 224), interpolation=cv2.INTER_LINEAR) for f in frames])
            hc = extract_features(resized)
            t = torch.from_numpy(resized).float() / 255.0
            t = (t.permute(0, 3, 1, 2) - MEAN) / STD
            return hc, t, label
        except Exception:
            return None
    return decode_sample

def create_label_only_decoder():
    def decode_label(sample):
        try:
            cls_data = sample.get('cls') or sample.get('txt')
            if cls_data is None: return None
            label_str = cls_data.decode().strip() if isinstance(cls_data, bytes) else str(cls_data).strip()
            label = LABEL2IDX.get(label_str, -1)
            if label not in TARGET_IDX:
                return None
            return label if label != -1 else None
        except:
            return None
    return decode_label

def collate_fn(samples):
    samples = [s for s in samples if s is not None]
    if not samples:
        return np.array([]), torch.empty(0), torch.tensor([])
    hc, frames_list, labels = zip(*samples)
    valid = [(h, f, l) for h, f, l in zip(hc, frames_list, labels) if f.numel() > 0]
    if not valid:
        return np.array([]), torch.empty(0), torch.tensor([])
    hc, frames_list, labels = zip(*valid)
    max_t  = max(f.shape[0] for f in frames_list)
    padded = torch.zeros(len(frames_list), max_t, 3, 224, 224)
    for i, f in enumerate(frames_list): padded[i, :f.shape[0]] = f
    return np.array(hc), padded, torch.tensor(labels)

def make_dataloader(shards, batch_size, num_workers=24):
    dataset = (
        wds.WebDataset(shards, shardshuffle=5000, handler=wds.warn_and_continue)
        .map(create_decoder())
        .select(lambda x: x is not None)
        .shuffle(2000)
        .batched(batch_size, collation_fn=collate_fn)
    )
    return wds.WebLoader(dataset, batch_size=None, num_workers=num_workers, prefetch_factor=8)

def get_shard_paths(data_dir, start_idx, end_idx):
    shards = []
    for i in range(start_idx, end_idx + 1):
        path = os.path.join(data_dir, f'dataset_{i:05d}.tar')
        if os.path.exists(path):
            shards.append(path)
    return shards

def save_checkpoint(model, optimizer, epoch, step):
    os.makedirs(SM_CHECKPOINT_DIR, exist_ok=True)
    chkpt_path = os.path.join(SM_CHECKPOINT_DIR, 'checkpoint.pt')
    state_dict = model.module.state_dict() if isinstance(model, nn.DataParallel) else model.state_dict()
    torch.save({'epoch': epoch, 'step': step, 'model': state_dict, 'optimizer': optimizer.state_dict()}, chkpt_path)
    print(f"[Checkpoint] Saved at {chkpt_path}")

def load_checkpoint(model, optimizer):
    chkpt_path = os.path.join(SM_CHECKPOINT_DIR, 'checkpoint.pt')
    if os.path.exists(chkpt_path):
        ckpt = torch.load(chkpt_path, map_location=DEVICE)
        state = ckpt['model']
        state = {k: v for k, v in state.items() if not k.startswith('head.')}
        missing, unexpected = model.load_state_dict(state, strict=False)
        print(f"[Checkpoint] Loaded backbone+lstm. Missing: {len(missing)}, Unexpected: {len(unexpected)}")
        # optimizer는 head 크기 변경으로 로드 안 함
        print(f"[Checkpoint] Resuming from step {ckpt.get('step', 0)}... (Optimizer reset)")
        return 0, ckpt.get('step', 0)
    print("[Checkpoint] No checkpoint found, starting fresh.")
    return 0, 0

def train(args):
    print(f"[DEBUG] DEVICE: {DEVICE}, GPUs: {SM_NUM_GPUS}")
    print(f"🔥 [TARGET MODE] Focusing ONLY on: {TARGET_CLASSES}")

    all_shards = get_shard_paths(SM_CHANNEL_TRAIN, args.train_start, args.train_end)
    val_shards   = [s for i, s in enumerate(all_shards) if i % 10 == 0]
    train_shards = [s for i, s in enumerate(all_shards) if i % 10 != 0]
    print(f"[DEBUG] Train: {len(train_shards)}, Val: {len(val_shards)}")

    if not train_shards:
        print("[ERROR] No training shards found!")
        return

    print("Loading XGBoost from S3...")
    obj = s3.get_object(Bucket=BUCKET, Key='models/xgboost_phase1.pkl')
    xgb_model = pickle.load(io.BytesIO(obj['Body'].read()))

    # 타겟 클래스 가중치 하드코딩
    class_weights = torch.zeros(NUM_CLASSES, dtype=torch.float32).to(DEVICE)
    class_weights[LABEL2IDX['Real']] = 2.0
    class_weights[LABEL2IDX['OpenSource_V2V_Cogvideox1.5']] = 1.0
    class_weights[LABEL2IDX['OpenSource_V2V_LTX']] = 1.0
    print(f"[INFO] Target weights - Real: 2.0, V2V_Cog: 1.0, V2V_LTX: 1.0")

    model = VideoAgent(NUM_CLASSES, args.dropout, args.backbone).to(DEVICE)
    optimizer = AdamW(model.parameters(), lr=args.learning_rate, weight_decay=args.l2_lambda)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = FocalLoss(gamma=args.focal_gamma, smoothing=args.label_smoothing, class_weights=class_weights)
    scaler = torch.cuda.amp.GradScaler()
    accumulation_steps = max(1, 32 // args.batch_size)

    start_epoch, global_step = load_checkpoint(model, optimizer)

    if SM_NUM_GPUS > 1:
        model = nn.DataParallel(model)

    for epoch in range(start_epoch, args.epochs):
        model.train()
        loader = make_dataloader(train_shards, args.batch_size)
        total_loss, correct, total = 0.0, 0, 0
        optimizer.zero_grad()
        _last_gpu_end = None

        for step_idx, (hc_feats, frames, labels) in enumerate(loader):
            t_data = time.time()
            if frames.numel() == 0:
                continue

            if global_step < args.warmup_steps:
                lr_scale = min(1.0, float(global_step + 1) / args.warmup_steps)
                for pg in optimizer.param_groups: pg['lr'] = args.learning_rate * lr_scale

            proba = xgb_model.predict_proba(hc_feats)
            uncertain = np.ones(len(labels), dtype=bool)

            frames, labels = frames[uncertain].to(DEVICE), labels[uncertain].to(DEVICE)

            with torch.cuda.amp.autocast():
                logits = model(frames)
                loss = criterion(logits, labels)
                l1 = sum(p.abs().sum() for p in model.parameters())
                loss = (loss + args.l1_lambda * l1) / accumulation_steps

            scaler.scale(loss).backward()

            if (global_step + 1) % accumulation_steps == 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            torch.cuda.synchronize()
            t_gpu_end = time.time()

            total_loss += loss.item() * accumulation_steps
            correct += (logits.argmax(1) == labels).sum().item()
            total += labels.size(0)
            global_step += 1

            if global_step % 200 == 0 and total > 0:
                print(f"Epoch: {epoch} | Step: {global_step} | Loss: {total_loss/200:.4f} | Acc: {correct/total*100:.2f}%")
                total_loss, correct, total = 0.0, 0, 0

            if global_step % 50 == 0 and _last_gpu_end is not None:
                print(f"[TIMING] step={global_step} data_wait={t_data-_last_gpu_end:.2f}s gpu={t_gpu_end-t_data:.2f}s")
            _last_gpu_end = t_gpu_end

            if global_step % 1000 == 0:
                save_checkpoint(model, optimizer, epoch, global_step)

        scheduler.step()

        if val_shards:
            model.eval()
            all_preds, all_labels = [], []
            with torch.no_grad():
                for hc_feats, frames, labels in make_dataloader(val_shards, args.batch_size):
                    if frames.numel() == 0: continue
                    labels_np = labels.numpy()
                    with torch.cuda.amp.autocast():
                        logits = model(frames.to(DEVICE))
                    batch_preds = logits.argmax(1).cpu().numpy()
                    all_preds.extend(batch_preds)
                    all_labels.extend(labels_np)
                    if len(all_labels) >= 5000: break

            if all_labels:
                f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
                print(f"=== [Val] Epoch {epoch} TARGET F1: {f1:.4f} ===")

    os.makedirs(SM_MODEL_DIR, exist_ok=True)
    final_state = model.module.state_dict() if isinstance(model, nn.DataParallel) else model.state_dict()
    torch.save(final_state, os.path.join(SM_MODEL_DIR, 'model.pt'))
    print("Training Complete.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=2)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--learning_rate', type=float, default=1e-4)
    parser.add_argument('--dropout', type=float, default=0.3)
    parser.add_argument('--cascade_threshold', type=float, default=0.75)
    parser.add_argument('--focal_gamma', type=float, default=2.0)
    parser.add_argument('--label_smoothing', type=float, default=0.05)
    parser.add_argument('--warmup_steps', type=int, default=500)
    parser.add_argument('--l1_lambda', type=float, default=1e-5)
    parser.add_argument('--l2_lambda', type=float, default=1e-4)
    parser.add_argument('--backbone', type=str, default='efficientnet_b4')
    parser.add_argument('--train_start', type=int, default=0)
    parser.add_argument('--train_end', type=int, default=6998)
    args = parser.parse_args()
    train(args)
