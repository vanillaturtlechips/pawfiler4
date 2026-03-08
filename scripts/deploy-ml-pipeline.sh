#!/bin/bash
# ML 파이프라인 전체 배포 (비용 최적화)

set -e

REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="s3://pawfiler-ml-artifacts"

echo "=== Step 1: 로컬 학습 (샘플 데이터) ==="
cd backend/services/video-analysis/ml
python3 train.py \
  --data-dir /media/user/eb0a27dd-868a-4423-9f75-a9a61440d1f4/preprocessed_samples \
  --epochs 5 \
  --batch-size 8

echo "=== Step 2: 모델 S3 업로드 ==="
tar czf model.tar.gz models/
aws s3 cp model.tar.gz ${BUCKET}/models/mobilevit-v2/ --region ${REGION}

echo "=== Step 3: SageMaker 엔드포인트 배포 (Auto-scaling) ==="
python3 deploy_endpoint.py

echo "=== Step 4: Docker 이미지 빌드 & 푸시 ==="
cd ..
docker build -t ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/pawfiler/video-analysis:latest .
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com
docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/pawfiler/video-analysis:latest

echo "=== Step 5: Kubernetes 배포 ==="
cd ../../../pawfiler4-argocd/apps/services/video-analysis
kubectl apply -k .

echo "=== Step 6: Auto-scaling 설정 (비용 최소화) ==="
aws application-autoscaling register-scalable-target \
  --service-namespace sagemaker \
  --resource-id endpoint/mobilevit-v2-endpoint/variant/AllTraffic \
  --scalable-dimension sagemaker:variant:DesiredInstanceCount \
  --min-capacity 0 \
  --max-capacity 3 \
  --region ${REGION}

aws application-autoscaling put-scaling-policy \
  --service-namespace sagemaker \
  --resource-id endpoint/mobilevit-v2-endpoint/variant/AllTraffic \
  --scalable-dimension sagemaker:variant:DesiredInstanceCount \
  --policy-name scale-down-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region ${REGION}

echo "=== 배포 완료 ==="
echo "비용 최적화 설정:"
echo "  - SageMaker Auto-scaling: 0-3 인스턴스"
echo "  - Cascade 아키텍처: 70% 영상만, 30% 음성, 10% LLM"
echo "  - faster-whisper: AWS Transcribe 대비 87% 절감"
echo "  - 예상 비용: ~$61/월 (100k 요청 기준)"
