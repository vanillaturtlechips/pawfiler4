import sagemaker
from sagemaker.pytorch import PyTorch
from sagemaker.inputs import TrainingInput
import boto3
import time

boto_session = boto3.Session(region_name='ap-northeast-2')
sagemaker_session = sagemaker.Session(boto_session=boto_session)
role = "arn:aws:iam::009946608368:role/service-role/AmazonSageMaker-ExecutionRole"

data_input = TrainingInput(
    s3_data='s3://ai-preprocessing/webdataset/',
    input_mode='FastFile'
)

job_name = f"pawfiler-balanced-6-{int(time.time())}"

estimator = PyTorch(
    entry_point='train3.py',
    source_dir='/home/user/Documents/finalproject/pawfiler4/scripts',
    role=role,
    sagemaker_session=sagemaker_session,
    framework_version='2.2.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g6.12xlarge',
    hyperparameters={
        'epochs':        5,
        'batch_size':    32,
        'learning_rate': 3e-4,
        'backbone':      'efficientnet_b4',
        'train_start':   0,
        'train_end':     6998,
    },
    use_spot_instances=True,
    max_run=86400,
    max_wait=172800,
    checkpoint_s3_uri='s3://ai-preprocessing/sagemaker/checkpoints/pawfiler-step4-eff-b4-balanced-5/',
    output_path='s3://ai-preprocessing/sagemaker/models/',
)

print(f"🔥 발사! [{job_name}]")
estimator.fit({'train': data_input}, wait=False, job_name=job_name)
print(f"✅ 제출 완료. SageMaker 콘솔에서 확인하세요.")
