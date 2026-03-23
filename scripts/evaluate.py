import os
import sys
import io
import pickle
import boto3
import torch
import numpy as np
import warnings
import gc
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(__file__))
# 🔥 train3에서 LABEL2IDX도 꼭 같이 가져와야 해! 🔥
from train3 import VideoAgent, AI_MODELS, create_decoder, collate_fn, LABEL2IDX
import webdataset as wds

CKPT_PATH    = '/opt/ml/checkpoints/checkpoint.pt'
S3_BUCKET    = 'ai-preprocessing'
S3_PREFIX    = 'webdataset'
TOTAL_SHARDS = 6999
DEVICE       = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
CASCADE_THRESHOLD = 0.75

def main():
    print(f"Device: {DEVICE}")

    # 1. 딥러닝 모델(VideoAgent) 로드
    ckpt = torch.load(CKPT_PATH, map_location=DEVICE)
    state_dict = {k.replace('module.', ''): v for k, v in ckpt['model'].items()}
    ckpt_num_classes = state_dict['head.1.weight'].shape[0]

    model = VideoAgent(ckpt_num_classes, dropout=0.3, backbone_name='efficientnet_b4').to(DEVICE)
    model.load_state_dict(state_dict)
    model.eval()

    # 2. XGBoost 모델 로드 (Cascade 1단계)
    print("Loading XGBoost model from S3...")
    s3 = boto3.client('s3', region_name='ap-northeast-2')
    obj = s3.get_object(Bucket=S3_BUCKET, Key='models/xgboost_phase1.pkl')
    xgb_model = pickle.load(io.BytesIO(obj['Body'].read()))

    # 3. 데이터 경로 설정 (검증용 샤드: 10개마다 1개씩 추출)
    data_dir = os.environ.get('SM_CHANNEL_TRAIN', f's3://{S3_BUCKET}/{S3_PREFIX}')
    if data_dir.startswith('s3://'):
        val_shards = [f'{data_dir}/dataset_{i:05d}.tar' for i in range(0, TOTAL_SHARDS, 10)]
    else:
        val_shards = [os.path.join(data_dir, f'dataset_{i:05d}.tar')
                      for i in range(0, TOTAL_SHARDS, 10)
                      if os.path.exists(os.path.join(data_dir, f'dataset_{i:05d}.tar'))]
    print(f"Val shards: {len(val_shards)}")

    # 4. 램(RAM) 절약형 데이터로더
    # (전체 스캔이므로 셔플 False, OOM 방지를 위해 배치 8, 워커 0)
    print("Setting up DataLoader (Shuffle=False, Batch=8, Workers=0)...")
    dataset = (
        wds.WebDataset(val_shards, shardshuffle=False, handler=wds.warn_and_continue, empty_check=False)
        .map(create_decoder())
        .select(lambda x: x is not None)
        .batched(8, collation_fn=collate_fn) 
    )
    loader = wds.WebLoader(dataset, batch_size=None, num_workers=0)

    all_preds, all_labels = [], []
    
    print(f"\n[🔥 전체 데이터 풀스캔 모드] Cascade threshold={CASCADE_THRESHOLD} 평가 시작!")
    with torch.no_grad():
        for step, (hc_feats, frames, labels) in enumerate(loader):
            if frames.numel() == 0:
                continue
            
            labels_np = labels.numpy()
            batch_preds = np.zeros(len(labels_np), dtype=int)
            
            # Phase 1: XGBoost 추론
            proba = xgb_model.predict_proba(hc_feats)
            xgb_preds = proba.argmax(axis=1)
            uncertain = proba.max(axis=1) < CASCADE_THRESHOLD
            
            # 확실한 건 XGBoost 정답으로 고정
            batch_preds[~uncertain] = xgb_preds[~uncertain]
            
            # Phase 2: 헷갈리는 것만 딥러닝(PyTorch)에 투입
            if uncertain.sum() > 0:
                with torch.cuda.amp.autocast():
                    logits = model(frames[uncertain].to(DEVICE))
                batch_preds[uncertain] = logits.argmax(1).cpu().numpy()
                del logits # 메모리 찌꺼기 즉시 삭제
            
            all_preds.extend(batch_preds)
            all_labels.extend(labels_np)
            
            # 원본 텐서 삭제 (램 폭발 방지)
            del frames, labels, hc_feats
            
            # 100 배치(약 800개)마다 생존 신고 및 램 청소
            if (step + 1) % 100 == 0:
                print(f"  {len(all_labels)} samples processed...")
                gc.collect()

    print(f"\n✅ 평가 루프 완료! 총 데이터 개수: {len(all_labels)}")
    if not all_labels:
        print("ERROR: No samples")
        return

    # 5. 최종 결과 출력 (🔥 대통합의 장: 도플갱어 암살 🔥)
    from sklearn.metrics import classification_report, f1_score
    
    # 도플갱어 클래스들을 진짜 클래스로 합치는 맵핑 딕셔너리
    LABEL_MAP = {}
    if 'real' in LABEL2IDX and 'Real' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['real']] = LABEL2IDX['Real']
    if 'SEINE' in LABEL2IDX and 'OpenSource_I2V_SEINE' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['SEINE']] = LABEL2IDX['OpenSource_I2V_SEINE']
    if 'SVD' in LABEL2IDX and 'OpenSource_I2V_SVD' in LABEL2IDX:
        LABEL_MAP[LABEL2IDX['SVD']] = LABEL2IDX['OpenSource_I2V_SVD']

    # 정답지와 예측지에서 헷갈리는 번호들을 싹 다 찐 번호로 바꿔치기
    mapped_labels = [LABEL_MAP.get(l, l) for l in all_labels]
    mapped_preds  = [LABEL_MAP.get(p, p) for p in all_preds]

    all_labels = np.array(mapped_labels)
    all_preds  = np.array(mapped_preds)
    
    unique = np.unique(all_labels)
    unique = unique[unique < ckpt_num_classes]

    print("\n" + "="*60)
    print("🏆 [최종 전체 데이터 평가 결과 (도플갱어 통합판!)] 🏆")
    print(classification_report(
        all_labels, all_preds,
        labels=unique,
        target_names=[AI_MODELS[i] for i in unique],
        zero_division=0, digits=4
    ))
    print(f"Macro F1   : {f1_score(all_labels, all_preds, average='macro',    zero_division=0):.4f}")
    print(f"Weighted F1: {f1_score(all_labels, all_preds, average='weighted', zero_division=0):.4f}")
    print("="*60)

if __name__ == '__main__':
    main()
