import sagemaker
from sagemaker.pytorch import PyTorch
from sagemaker.inputs import TrainingInput

role = "arn:aws:iam::009946608368:role/service-role/AmazonSageMaker-ExecutionRole"

estimator = PyTorch(
    entry_point='evaluate.py',
    source_dir='/home/user/Documents/finalproject/pawfiler4/scripts',
    role=role,
    framework_version='2.0.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g5.2xlarge',
    use_spot_instances=False,
    max_run=14400,
    checkpoint_s3_uri='s3://ai-preprocessing/sagemaker/checkpoints/pawfiler-step3-efficientnet-b4-1774013467/',
    output_path='s3://ai-preprocessing/sagemaker/eval/',
    subnets=['subnet-0dbec778d8a32bd57', 'subnet-024efc2ffafa1cd48'],
    security_group_ids=['sg-07f53df04cf46e7e2'],
)

print("🚀 Evaluation job 시작...")
estimator.fit({
    'train': TrainingInput(
        's3://ai-preprocessing/webdataset/',
        s3_data_type='S3Prefix',
        input_mode='FastFile'
    )
})
