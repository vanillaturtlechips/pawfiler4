#!/bin/bash
# SageMaker Spot 학습 Job (비용 90% 절감)

ROLE_ARN="arn:aws:iam::ACCOUNT_ID:role/SageMakerRole"
BUCKET="s3://pawfiler-ml-artifacts"
REGION="ap-northeast-2"

# 1. 데이터 S3 업로드 (한번만)
echo "Uploading training data..."
aws s3 sync /media/user/eb0a27dd-868a-4423-9f75-a9a61440d1f4/preprocessed_samples/celeb_df \
  ${BUCKET}/data/celeb_df/ --region ${REGION}

# 2. 학습 코드 업로드
echo "Uploading training code..."
tar czf sourcedir.tar.gz train.py requirements.txt
aws s3 cp sourcedir.tar.gz ${BUCKET}/code/ --region ${REGION}

# 3. Spot 학습 Job 실행
echo "Starting Spot training job..."
python3 << EOF
import boto3
import time

sagemaker = boto3.client('sagemaker', region_name='${REGION}')

job_name = f"mobilevit-v2-{int(time.time())}"

training_params = {
    'TrainingJobName': job_name,
    'RoleArn': '${ROLE_ARN}',
    'AlgorithmSpecification': {
        'TrainingImage': '763104351884.dkr.ecr.${REGION}.amazonaws.com/pytorch-training:2.0.0-gpu-py310',
        'TrainingInputMode': 'File'
    },
    'InputDataConfig': [{
        'ChannelName': 'training',
        'DataSource': {
            'S3DataSource': {
                'S3DataType': 'S3Prefix',
                'S3Uri': '${BUCKET}/data/celeb_df/',
                'S3DataDistributionType': 'FullyReplicated'
            }
        }
    }],
    'OutputDataConfig': {
        'S3OutputPath': '${BUCKET}/models/'
    },
    'ResourceConfig': {
        'InstanceType': 'ml.g4dn.xlarge',
        'InstanceCount': 1,
        'VolumeSizeInGB': 30
    },
    'StoppingCondition': {
        'MaxRuntimeInSeconds': 3600
    },
    'EnableManagedSpotTraining': True,  # Spot 활성화
    'HyperParameters': {
        'epochs': '10',
        'batch-size': '16',
        'lr': '0.0001'
    }
}

response = sagemaker.create_training_job(**training_params)
print(f"Training job started: {job_name}")
print(f"Spot training enabled - expect 70-90% cost savings")
EOF
