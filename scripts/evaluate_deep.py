"""
XGBoost 단독 성능 + Real Confusion + Threshold 최적화
DL 모델 없음 - OOM 방지
"""
import os, sys, io, pickle, gc, warnings
import boto3, numpy as np
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(__file__))
from train3 import AI_MODELS, create_decoder, collate_fn, LABEL2IDX

import webdataset as wds
from sklearn.metrics import classification_report, f1_score
from collections import Counter

S3_BUCKET    = 'ai-preprocessing'
TOTAL_SHARDS = 6999

LABEL_MAP = {}

def build_label_map():
    if 'real' in LABEL2IDX and 'Real' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['real']] = LABEL2IDX['Real']
    if 'SEINE' in LABEL2IDX and 'OpenSource_I2V_SEINE' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['SEINE']] = LABEL2IDX['OpenSource_I2V_SEINE']
    if 'SVD' in LABEL2IDX and 'OpenSource_I2V_SVD' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['SVD']] = LABEL2IDX['OpenSource_I2V_SVD']

def map_labels(arr):
    return np.array([LABEL_MAP.get(int(x), int(x)) for x in arr])

def main():
    build_label_map()
    real_idx = LABEL2IDX.get('Real', -1)
    num_classes = len(AI_MODELS)

    s3 = boto3.client('s3', region_name='ap-northeast-2')
    obj = s3.get_object(Bucket=S3_BUCKET, Key='models/xgboost_phase1.pkl')
    xgb_model = pickle.load(io.BytesIO(obj['Body'].read()))
    xgb_classes = list(xgb_model.classes_)
    real_col = xgb_classes.index(real_idx) if real_idx in xgb_classes else -1
    print(f"XGBoost classes: {len(xgb_classes)}, Real col: {real_col}")

    data_dir = os.environ.get('SM_CHANNEL_TRAIN', f's3://{S3_BUCKET}/webdataset')
    val_shards = [f'{data_dir}/dataset_{i:05d}.tar' for i in range(0, TOTAL_SHARDS, 70)]
    print(f"Val shards: {len(val_shards)}")

    dataset = (
        wds.WebDataset(val_shards, shardshuffle=False, handler=wds.warn_and_continue, empty_check=False)
        .map(create_decoder())
        .select(lambda x: x is not None)
        .batched(16, collation_fn=collate_fn)
    )
    loader = wds.WebLoader(dataset, batch_size=None, num_workers=0)

    max_samples = 8000
    all_labels     = np.zeros(max_samples, dtype=np.int32)
    xgb_preds_all  = np.zeros(max_samples, dtype=np.int32)
    xgb_real_proba = np.zeros(max_samples, dtype=np.float32)
    n = 0

    print("스캔 시작...")
    for step, (hc_feats, frames, labels) in enumerate(loader):
        if len(labels) == 0:
            continue
        b = len(labels)
        if n + b > max_samples:
            break

        proba = xgb_model.predict_proba(hc_feats)
        xgb_pred = proba.argmax(axis=1)
        real_p = proba[:, real_col] if real_col >= 0 else np.zeros(b)

        del frames, hc_feats

        all_labels[n:n+b]     = labels.numpy()
        xgb_preds_all[n:n+b]  = xgb_pred
        xgb_real_proba[n:n+b] = real_p
        n += b

        if (step + 1) % 50 == 0:
            print(f"  {n} samples...")
            gc.collect()

    all_labels     = map_labels(all_labels[:n])
    xgb_preds_all  = map_labels(xgb_preds_all[:n])
    xgb_real_proba = xgb_real_proba[:n]

    unique = np.unique(all_labels)
    unique = unique[unique < num_classes]
    names  = [AI_MODELS[i] for i in unique]

    # ── 1. XGBoost 단독 성능 ─────────────────────────────────────
    print("\n" + "="*60)
    print("📊 [1] XGBoost 단독 성능")
    print(classification_report(all_labels, xgb_preds_all, labels=unique, target_names=names, zero_division=0, digits=4))
    print(f"XGBoost Macro F1: {f1_score(all_labels, xgb_preds_all, average='macro', zero_division=0):.4f}")

    # ── 2. Real 오분류 Top10 ──────────────────────────────────────
    print("\n" + "="*60)
    print("📊 [2] Real 샘플이 XGBoost에서 어디로 오분류되는가")
    real_mask = (all_labels == real_idx)
    print(f"Real 샘플 총 {real_mask.sum()}개")
    if real_mask.sum() > 0:
        for cls_idx, cnt in Counter(xgb_preds_all[real_mask]).most_common(10):
            name = AI_MODELS[cls_idx] if cls_idx < len(AI_MODELS) else str(cls_idx)
            print(f"  → {name}: {cnt}개 ({cnt/real_mask.sum()*100:.1f}%)")

    # ── 3. Threshold 튜닝 ─────────────────────────────────────────
    print("\n" + "="*60)
    print("📊 [3] XGBoost Real threshold 튜닝")
    real_true = (all_labels == real_idx).astype(int)
    best_f1, best_thresh = 0, 0.5
    for thresh in np.arange(0.05, 0.95, 0.05):
        pred_real = (xgb_real_proba >= thresh).astype(int)
        tp = ((pred_real == 1) & (real_true == 1)).sum()
        fp = ((pred_real == 1) & (real_true == 0)).sum()
        fn = ((pred_real == 0) & (real_true == 1)).sum()
        prec = tp / (tp + fp + 1e-8)
        rec  = tp / (tp + fn + 1e-8)
        f1   = 2 * prec * rec / (prec + rec + 1e-8)
        print(f"  thresh={thresh:.2f} | precision={prec:.3f} recall={rec:.3f} F1={f1:.3f}")
        if f1 > best_f1:
            best_f1, best_thresh = f1, thresh
    print(f"\n  ✅ 최적 threshold: {best_thresh:.2f} (Real F1={best_f1:.4f})")

    # ── 4. 최적 threshold 적용 후 전체 Macro F1 ──────────────────
    print("\n" + "="*60)
    print(f"📊 [4] threshold={best_thresh:.2f} 적용 시 전체 성능")
    final_preds = xgb_preds_all.copy()
    final_preds[xgb_real_proba >= best_thresh] = real_idx
    print(classification_report(all_labels, final_preds, labels=unique, target_names=names, zero_division=0, digits=4))
    print(f"Threshold 적용 후 Macro F1: {f1_score(all_labels, final_preds, average='macro', zero_division=0):.4f}")
    print("="*60)

if __name__ == '__main__':
    main()
