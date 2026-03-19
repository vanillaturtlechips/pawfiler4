import sagemaker
from sagemaker.pytorch import PyTorch
from sagemaker.inputs import TrainingInput
import time

# ============================================================
# STEP 설정: 1 = 스모크 테스트 (10% 데이터, 1 에포크)
#            2 = 미니 벤치마크 (10% 데이터, 5 에포크)
# ============================================================
STEP = 2

import boto3
boto_session = boto3.Session(region_name='ap-northeast-2')
sagemaker_session = sagemaker.Session(boto_session=boto_session)
role = "arn:aws:iam::009946608368:role/service-role/AmazonSageMaker-ExecutionRole"

data_input = TrainingInput(
    s3_data='s3://ai-preprocessing/webdataset/',
    input_mode='FastFile'
)

experiments = [
   # {'backbone': 'mobilevitv2_100',      'batch_size': 64},
    {'backbone': 'efficientnet_b4',      'batch_size': 32},
    {'backbone': 'vit_base_patch16_224', 'batch_size': 32},
]

# 전체 샤드 수 기준 (train: 0~6499, val: 6500~6999 가정)
STEP_CONFIG = {
    1: {'epochs': 1, 'train_start': 0, 'train_end': 649,  'val_start': 6500, 'val_end': 6549},   # 10%
    2: {'epochs': 5, 'train_start': 0, 'train_end': 3249, 'val_start': 6500, 'val_end': 6749},   # 50%
}

cfg = STEP_CONFIG[STEP]

for exp in experiments:
    job_name = f"pawfiler-step{STEP}-{exp['backbone'].replace('_', '-')}-{int(time.time())}"

    hyperparameters = {
        'epochs':       cfg['epochs'],
        'batch_size':   exp['batch_size'],
        'learning_rate': 0.0003,
        'backbone':     exp['backbone'],
        'train_start':  cfg['train_start'],
        'train_end':    cfg['train_end'],
        'val_start':    cfg['val_start'],
        'val_end':      cfg['val_end'],
    }

    estimator = PyTorch(
        entry_point='train3.py',
        source_dir='/home/user/Downloads/sage',
        role=role,
        sagemaker_session=sagemaker_session,
        framework_version='2.2.0',
        py_version='py310',
        instance_count=1,
        instance_type='ml.g6.12xlarge',
        hyperparameters=hyperparameters,
        use_spot_instances=(STEP == 2),   # Step 2는 스팟으로 비용 절감
        max_run=7200 if STEP == 1 else 43200,
        max_wait=None if STEP == 1 else 50400,
        checkpoint_s3_uri=f's3://ai-preprocessing/sagemaker/checkpoints/{job_name}/' if STEP == 2 else None,
        output_path='s3://ai-preprocessing/sagemaker/models/',
    )

    print(f"🔥 Step {STEP} 발사! [{exp['backbone']}]")
    estimator.fit({'train': data_input}, wait=False, job_name=job_name)
    time.sleep(1)  # job_name 중복 방지

print(f"\n✅ Step {STEP} - {len(experiments)}개 작업 전달 완료!")
print("SageMaker 콘솔 → Training jobs 에서 확인하세요.")
