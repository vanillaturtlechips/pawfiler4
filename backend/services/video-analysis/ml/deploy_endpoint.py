#!/usr/bin/env python3
"""SageMaker Spot 엔드포인트 배포 (비용 최소화)"""
import boto3
import time

REGION = 'ap-northeast-2'
ROLE_ARN = 'arn:aws:iam::ACCOUNT_ID:role/SageMakerRole'
MODEL_DATA = 's3://pawfiler-ml-artifacts/models/mobilevit-v2/model.tar.gz'
ENDPOINT_NAME = 'mobilevit-v2-endpoint'

sagemaker = boto3.client('sagemaker', region_name=REGION)

# 1. 모델 생성
model_name = f'mobilevit-v2-{int(time.time())}'
container = f'763104351884.dkr.ecr.{REGION}.amazonaws.com/pytorch-inference:2.0.0-gpu-py310'

sagemaker.create_model(
    ModelName=model_name,
    PrimaryContainer={
        'Image': container,
        'ModelDataUrl': MODEL_DATA,
        'Environment': {
            'SAGEMAKER_PROGRAM': 'inference.py',
            'SAGEMAKER_SUBMIT_DIRECTORY': MODEL_DATA
        }
    },
    ExecutionRoleArn=ROLE_ARN
)

# 2. 엔드포인트 설정 (Spot 인스턴스 - 70% 절감)
config_name = f'mobilevit-v2-config-{int(time.time())}'
sagemaker.create_endpoint_config(
    EndpointConfigName=config_name,
    ProductionVariants=[{
        'VariantName': 'AllTraffic',
        'ModelName': model_name,
        'InstanceType': 'ml.g4dn.xlarge',
        'InitialInstanceCount': 1,
        'InitialVariantWeight': 1.0,
        # Spot 인스턴스 설정 없음 (엔드포인트는 On-Demand만 지원)
        # 대신 Auto-scaling으로 비용 최적화
    }]
)

# 3. 엔드포인트 생성
sagemaker.create_endpoint(
    EndpointName=ENDPOINT_NAME,
    EndpointConfigName=config_name
)

print(f"Endpoint {ENDPOINT_NAME} is being created...")
print("Use Auto-scaling to minimize costs:")
print(f"  aws application-autoscaling register-scalable-target \\")
print(f"    --service-namespace sagemaker \\")
print(f"    --resource-id endpoint/{ENDPOINT_NAME}/variant/AllTraffic \\")
print(f"    --scalable-dimension sagemaker:variant:DesiredInstanceCount \\")
print(f"    --min-capacity 0 --max-capacity 3")
