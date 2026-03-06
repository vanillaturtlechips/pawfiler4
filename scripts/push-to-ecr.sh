#!/bin/bash
set -e

AWS_ACCOUNT_ID="009946608368"
AWS_REGION="ap-northeast-2"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "🔐 ECR 로그인..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

echo "📦 Building Quiz Service..."
docker build -t ${ECR_REGISTRY}/pawfiler/quiz-service:latest -f backend/services/quiz/Dockerfile backend/services/quiz
docker push ${ECR_REGISTRY}/pawfiler/quiz-service:latest

echo "📦 Building Community Service..."
docker build -t ${ECR_REGISTRY}/pawfiler/community-service:latest -f backend/services/community/Dockerfile backend/services/community
docker push ${ECR_REGISTRY}/pawfiler/community-service:latest

echo "📦 Building Admin Service..."
docker build -t ${ECR_REGISTRY}/pawfiler/admin-service:latest -f backend/services/admin/Dockerfile backend/services/admin
docker push ${ECR_REGISTRY}/pawfiler/admin-service:latest

echo "📦 Building BFF..."
docker build -t ${ECR_REGISTRY}/pawfiler/bff:latest -f backend/bff/Dockerfile backend/bff
docker push ${ECR_REGISTRY}/pawfiler/bff:latest

echo "✅ All images pushed successfully!"
