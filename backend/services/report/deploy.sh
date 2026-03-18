#!/bin/bash
# report-service ECR 빌드 & 푸시 스크립트
set -e

AWS_ACCOUNT_ID="009946608368"
AWS_REGION="ap-northeast-2"
ECR_REPO="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/pawfiler/report-service"
IMAGE_TAG="${1:-latest}"

echo "=== 1. ECR 로그인 ==="
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "=== 2. ECR 리포지토리 생성 (이미 있으면 무시) ==="
aws ecr describe-repositories --repository-names pawfiler/report-service --region $AWS_REGION 2>/dev/null \
  || aws ecr create-repository --repository-name pawfiler/report-service --region $AWS_REGION

echo "=== 3. Docker 빌드 ==="
docker build -t "$ECR_REPO:$IMAGE_TAG" .

echo "=== 4. ECR 푸시 ==="
docker push "$ECR_REPO:$IMAGE_TAG"

echo "=== 완료: $ECR_REPO:$IMAGE_TAG ==="
echo ""
echo "ArgoCD 자동 배포가 설정되어 있으면 잠시 후 자동 반영됩니다."
echo "수동 동기화: argocd app sync pawfiler"
