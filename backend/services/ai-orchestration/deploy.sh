#!/bin/bash
# =================================================================
# PawFiler AI Orchestration — EKS 배포 스크립트
# =================================================================
set -e

REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/pawfiler-serve"
IMAGE_TAG="${1:-latest}"
NAMESPACE="pawfiler"

echo "=== PawFiler AI Orchestration 배포 시작 ==="
echo "Region: ${REGION}"
echo "ECR: ${ECR_REPO}:${IMAGE_TAG}"
echo ""

# Step 1: S3에서 모델 다운로드 및 변환
echo "[1/6] S3에서 모델 다운로드..."
mkdir -p ./models_temp
aws s3 cp s3://ai-preprocessing/mobilevit_phase2.pt ./models_temp/ || echo "mobilevit_phase2.pt 다운로드 실패"
aws s3 cp s3://ai-preprocessing/xgboost_phase1.pkl ./models_temp/ || echo "xgboost_phase1.pkl 다운로드 실패"

# Step 2: 모델 포맷 변환
echo "[2/6] 모델 포맷 변환..."
python3 prepare_models.py \
    --video-ckpt ./models_temp/mobilevit_phase2.pt \
    --xgb-ckpt ./models_temp/xgboost_phase1.pkl \
    --output-dir ./efs_models

# Step 3: 변환된 모델을 S3에 업로드
echo "[3/6] 변환된 모델을 S3에 업로드..."
aws s3 cp ./efs_models/ s3://ai-preprocessing/models/ --recursive

# Step 4: Docker 이미지 빌드 및 푸시
echo "[4/6] Docker 이미지 빌드..."
docker build -t pawfiler-serve:${IMAGE_TAG} .

echo "[5/6] ECR 로그인 및 이미지 푸시..."
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR_REPO}

# ECR 리포지토리 생성 (없으면)
aws ecr describe-repositories --repository-names pawfiler-serve --region ${REGION} 2>/dev/null || \
    aws ecr create-repository --repository-name pawfiler-serve --region ${REGION}

docker tag pawfiler-serve:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}
docker push ${ECR_REPO}:${IMAGE_TAG}

# Step 5: K8s 매니페스트 업데이트 및 배포
echo "[6/6] K8s 배포..."

# rayservice.yaml의 이미지 경로 업데이트
sed "s|<ACCOUNT>|${ACCOUNT_ID}|g; s|<REGION>|${REGION}|g" rayservice.yaml > rayservice_deploy.yaml

# Namespace 생성 (없으면)
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# 배포
kubectl apply -f rayservice_deploy.yaml

# HPA 적용 여부 선택
read -p "HPA 적용 (트래픽 없으면 0으로 스케일)? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "HPA 적용 중..."
    kubectl apply -f hpa.yaml
else
    echo "HPA 스킵 (항상 최소 1개 유지)"
fi

echo ""
echo "=== 배포 완료 ==="
echo "상태 확인:"
echo "  kubectl get rayservice -n ${NAMESPACE}"
echo "  kubectl get pods -n ${NAMESPACE} -l app=pawfiler"
echo ""
echo "로그 확인:"
echo "  kubectl logs -n ${NAMESPACE} -l role=head -f"
echo ""
echo "포트 포워딩 (로컬 테스트):"
echo "  kubectl port-forward -n ${NAMESPACE} svc/pawfiler-serve-head-svc 8000:8000"
