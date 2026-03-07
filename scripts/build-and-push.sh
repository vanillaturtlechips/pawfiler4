#!/bin/bash
set -e

# ECR 설정
AWS_ACCOUNT_ID="009946608368"
AWS_REGION="ap-northeast-2"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "🔐 ECR 로그인..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Quiz Service 빌드 및 푸시
echo "📦 Building quiz-service..."
docker build -t ${ECR_REGISTRY}/pawfiler/quiz-service:latest -f backend/services/quiz/Dockerfile backend/services/quiz
docker push ${ECR_REGISTRY}/pawfiler/quiz-service:latest

# Community Service 빌드 및 푸시
echo "📦 Building community-service..."
docker build -t ${ECR_REGISTRY}/pawfiler/community-service:latest -f backend/services/community/Dockerfile backend/services/community
docker push ${ECR_REGISTRY}/pawfiler/community-service:latest

# Admin Service 빌드 및 푸시
echo "📦 Building admin-service..."
docker build -t ${ECR_REGISTRY}/pawfiler/admin-service:latest -f backend/services/admin/Dockerfile backend/services/admin
docker push ${ECR_REGISTRY}/pawfiler/admin-service:latest

# Admin Frontend 빌드 및 푸시 (nginx pod, 바스쳔 port-forward용)
echo "📦 Building admin-frontend..."
docker build -t ${ECR_REGISTRY}/pawfiler/admin-frontend:latest admin-frontend/
docker push ${ECR_REGISTRY}/pawfiler/admin-frontend:latest

echo "✅ All services built and pushed successfully!"

