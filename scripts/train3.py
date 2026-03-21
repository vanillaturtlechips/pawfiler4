"""
PawFiler ML Training - SageMaker Entry Point (FastFile Mode)
Phase 2: Backbone + LSTM (Managed Spot Training Ready)
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
import torch.multiprocessing
torch.multiprocessing.set_sharing_strategy('file_system')
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from timm import create_model
from sklearn.metrics import f1_score, recall_score

# SageMaker 환경 변수
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
    'causvid_24fps', 'vidu', 'wan', 'real', 'fake', 'audio_fake',
]
LABEL2IDX   = {l: i for i, l in enumerate(AI_MODELS)}
NUM_CLASSES = len(AI_MODELS)

class FocalLoss(nn.Module):
    def __init__(self, gamma, smoothing, class_weights=None):
        super().__init__()
        self.gamma = gamma
        self.smoothing = smoothing
        self.class_weights = class_weights  # Tensor or None

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(
            logits, targets,
            weight=self.class_weights,
            reduction='none',
            label_smoothing=self.smoothing
        )
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()

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
    def __init__(self, num_classes, dropout, backbone_name='mobilevitv2_100'):
        super().__init__()
        self.backbone = create_model(backbone_name, pretrained=True, num_classes=0)
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
            
            if label == -1: 
                return None

            frames = np.load(io.BytesIO(npz_data) if isinstance(npz_data, bytes) else npz_data)['frames']
            if frames.ndim == 2: frames = np.stack([frames]*3, axis=-1)[np.newaxis]
            frames = frames[:16]

            resized = np.stack([cv2.resize(f, (224, 224), interpolation=cv2.INTER_LINEAR) for f in frames])
            hc = extract_features(resized)

            t = torch.from_numpy(resized).float() / 255.0
            t = (t.permute(0, 3, 1, 2) - MEAN) / STD
            return hc, t, label
        except Exception as e:
            return None
    return decode_sample

def collate_fn(samples):
    hc, frames_list, labels = zip(*samples)
    valid = [(h, f, l) for h, f, l in zip(hc, frames_list, labels) if f.numel() > 0]
    if not valid:
        return np.array(hc), torch.empty(0), torch.tensor(labels)
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
        .batched(batch_size, collation_fn=collate_fn)
    )
    return wds.WebLoader(dataset, batch_size=None, num_workers=num_workers, prefetch_factor=2)

def get_shard_paths(data_dir, start_idx, end_idx):
    """FastFile로 마운트된 디렉토리에서 샤드 경로 목록 생성"""
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
        model.load_state_dict(ckpt['model'])
        optimizer.load_state_dict(ckpt['optimizer'])
        print(f"[Checkpoint] Resuming from step {ckpt['step']}...")
        return ckpt['epoch'], ckpt['step']
    return 0, 0

def train(args):
    print(f"[DEBUG] webdataset version: {wds.__version__}")
    print(f"[DEBUG] CUDA available: {torch.cuda.is_available()}")
    print(f"[DEBUG] GPU count: {torch.cuda.device_count()}")
    print(f"[DEBUG] DEVICE: {DEVICE}")
    print(f"[DEBUG] SM_NUM_GPUS: {SM_NUM_GPUS}")
    print(f"[DEBUG] backbone: {args.backbone}")
    print(f"[DEBUG] batch_size: {args.batch_size}")

    # ==========================================
    # train_start/end, val_start/end 파라미터 사용
    # ==========================================
    train_shards = get_shard_paths(SM_CHANNEL_TRAIN, args.train_start, args.train_end)
    val_shards   = get_shard_paths(SM_CHANNEL_TRAIN, args.val_start,   args.val_end)

    # val 샤드가 없으면 train에서 10% 분리
    if not val_shards:
        print("[WARNING] val_shards empty, splitting 10% from train_shards")
        split = max(1, len(train_shards) // 10)
        val_shards   = train_shards[-split:]
        train_shards = train_shards[:-split]

    print(f"[DEBUG] Train shards: {len(train_shards)}, Val shards: {len(val_shards)}")

    if not train_shards:
        print("[ERROR] No training shards found!")
        return

    # Phase 1 XGBoost 로드
    print("Loading Phase 1 XGBoost model from S3...")
    obj = s3.get_object(Bucket=BUCKET, Key='models/xgboost_phase1.pkl')
    xgb_model = pickle.load(io.BytesIO(obj['Body'].read()))

    # 클래스 균형 가중치 계산 (train 샤드 일부 스캔)
    print("[INFO] Computing class weights from sample shards...")
    class_counts = np.zeros(NUM_CLASSES, dtype=np.float32)
    scan_shards = train_shards[::max(1, len(train_shards)//50)]  # 최대 50개 샤드만 스캔
    for shard in scan_shards:
        try:
            ds = wds.WebDataset(shard, handler=wds.warn_and_continue).map(create_decoder()).select(lambda x: x is not None)
            for sample in ds:
                class_counts[sample[2]] += 1
        except Exception:
            continue
    class_counts = np.maximum(class_counts, 1)  # 0 방지
    class_weights = torch.tensor(class_counts.sum() / (NUM_CLASSES * class_counts), dtype=torch.float32).to(DEVICE)
    print(f"[INFO] Class weights computed. Min: {class_weights.min():.2f}, Max: {class_weights.max():.2f}")

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
        _last_time = None

        for step_idx, (hc_feats, frames, labels) in enumerate(loader):
            t_data = time.time()

            if global_step < args.warmup_steps:
                lr_scale = min(1.0, float(global_step + 1) / args.warmup_steps)
                for pg in optimizer.param_groups: pg['lr'] = args.learning_rate * lr_scale

            proba = xgb_model.predict_proba(hc_feats)
            uncertain = proba.max(axis=1) < args.cascade_threshold
            if uncertain.sum() == 0: continue

            frames, labels = frames[uncertain].to(DEVICE), labels[uncertain].to(DEVICE)
            t_gpu_start = time.time()

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

            if global_step % 50 == 0:
                gpu_time = t_gpu_end - t_gpu_start
                if _last_time is not None:
                    data_time = t_data - _last_time
                    print(f"[TIMING] step={global_step} data_wait={data_time:.2f}s gpu={gpu_time:.2f}s")
                _last_time = t_gpu_end

            if global_step % 1000 == 0:
                save_checkpoint(model, optimizer, epoch, global_step)

        scheduler.step()

        # ==========================================
        # 검증 (Validation) 루프 - XGBoost Cascade 로직 통합
        # ==========================================
        if val_shards:
            model.eval()
            all_preds, all_labels = [], []
            val_loader = make_dataloader(val_shards, args.batch_size)
            
            with torch.no_grad():
                for hc_feats, frames, labels in val_loader:
                    if frames.numel() == 0:
                        continue
                    
                    labels_np = labels.numpy()
                    batch_size_cur = len(labels_np)
                    batch_preds = np.zeros(batch_size_cur, dtype=int)
                    
                    # 1. XGBoost 예측
                    proba = xgb_model.predict_proba(hc_feats)
                    xgb_preds = proba.argmax(axis=1)
                    xgb_max = proba.max(axis=1)
                    
                    # 2. 불확실성 필터링 (Cascade)
                    uncertain = xgb_max < args.cascade_threshold
                    certain = ~uncertain
                    
                    # 3. 확실한 샘플은 XGBoost 예측 채택
                    if certain.sum() > 0:
                        batch_preds[certain] = xgb_preds[certain]
                        
                    # 4. 불확실한 샘플만 DL 모델 통과
                    if uncertain.sum() > 0:
                        u_frames = frames[uncertain].to(DEVICE)
                        with torch.cuda.amp.autocast():
                            logits = model(u_frames)
                        dl_preds = logits.argmax(1).cpu().numpy()
                        batch_preds[uncertain] = dl_preds
                        
                    all_preds.extend(batch_preds)
                    all_labels.extend(labels_np)
                    
                    # 미니 벤치마크에서는 수집 샘플 제한을 여유있게 혹은 없애도 됩니다.
                    if len(all_labels) >= 5000: 
                        break

            print(f"[Val DEBUG] samples collected: {len(all_labels)}")
            if len(all_labels) == 0:
                print("=== [Val] Epoch WARNING: No valid samples! ===")
            else:
                unique_labels = np.unique(all_labels)
                print(f"[Val DEBUG] Unique classes in validation: {len(unique_labels)} classes found.")
                
                f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
                print(f"=== [Val] Epoch {epoch} F1 Score: {f1:.4f} ===")

    # 최종 모델 저장
    os.makedirs(SM_MODEL_DIR, exist_ok=True)
    final_state_dict = model.module.state_dict() if isinstance(model, nn.DataParallel) else model.state_dict()
    torch.save(final_state_dict, os.path.join(SM_MODEL_DIR, 'model.pt'))
    print("Training Complete. Model saved to SM_MODEL_DIR.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=5)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--learning_rate', type=float, default=3e-4)
    parser.add_argument('--dropout', type=float, default=0.3)
    parser.add_argument('--cascade_threshold', type=float, default=0.75)
    parser.add_argument('--focal_gamma', type=float, default=1.5)
    parser.add_argument('--label_smoothing', type=float, default=0.1)
    parser.add_argument('--warmup_steps', type=int, default=1500)
    parser.add_argument('--l1_lambda', type=float, default=1e-5)
    parser.add_argument('--l2_lambda', type=float, default=1e-4)
    parser.add_argument('--backbone', type=str, default='mobilevitv2_100')
    parser.add_argument('--train_start', type=int, default=0)
    parser.add_argument('--train_end', type=int, default=6500)
    parser.add_argument('--val_start', type=int, default=6501)
    parser.add_argument('--val_end', type=int, default=6998)

    args = parser.parse_args()
    train(args)
