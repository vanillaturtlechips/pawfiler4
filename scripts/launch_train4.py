import sagemaker
from sagemaker.pytorch import PyTorch
from sagemaker.inputs import TrainingInput

role = "arn:aws:iam::009946608368:role/service-role/AmazonSageMaker-ExecutionRole"

estimator = PyTorch(
    entry_point='train4.py',
    source_dir='/home/user/Documents/finalproject/pawfiler4/scripts',
    role=role,
    framework_version='2.0.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g6.12xlarge',
    use_spot_instances=True,
    max_run=21600,
    max_wait=28800,
    hyperparameters={
        'epochs': 1,
        'batch_size': 32,
        'learning_rate': 5e-5,
        'cascade_threshold': 0.60,
        'focal_gamma': 2.0,
    },
    checkpoint_s3_uri='s3://ai-preprocessing/sagemaker/checkpoints/pawfiler-step3-efficientnet-b4-1774013467/',
    output_path='s3://ai-preprocessing/sagemaker/models/pawfiler-step4-finetune/',
    subnets=['subnet-0dbec778d8a32bd57', 'subnet-024efc2ffafa1cd48'],
    security_group_ids=['sg-07f53df04cf46e7e2'],
)

print("🚀 Fine-tuning job 시작...")
estimator.fit({
    'train': TrainingInput(
        's3://ai-preprocessing/webdataset/',
        s3_data_type='S3Prefix',
        input_mode='FastFile'
    )
})
