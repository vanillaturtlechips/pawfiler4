#!/bin/bash
set -e

AWS_ACCOUNT_ID="009946608368"
AWS_REGION="ap-northeast-2"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "=== ECR Login ==="
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

cd /home/user/Documents/finalproject/pawfiler4

echo "=== Building Frontend ==="
docker build -t ${ECR_REGISTRY}/pawfiler/frontend:latest -f Dockerfile .
docker push ${ECR_REGISTRY}/pawfiler/frontend:latest

echo "=== Building Quiz Service ==="
cd backend/services/quiz && docker build -t ${ECR_REGISTRY}/pawfiler/quiz-service:latest . && cd ../../..
docker push ${ECR_REGISTRY}/pawfiler/quiz-service:latest

echo "=== Building Community Service ==="
cd backend/services/community && docker build -t ${ECR_REGISTRY}/pawfiler/community-service:latest . && cd ../../..
docker push ${ECR_REGISTRY}/pawfiler/community-service:latest

echo "=== Building Video Analysis Service ==="
docker build -t ${ECR_REGISTRY}/pawfiler/video-analysis-service:latest -f backend/services/video-analysis/Dockerfile backend
docker push ${ECR_REGISTRY}/pawfiler/video-analysis-service:latest

echo "=== Building Envoy Proxy ==="
docker build -t ${ECR_REGISTRY}/pawfiler/envoy-proxy:latest -f backend/quiz-proxy/Dockerfile backend
docker push ${ECR_REGISTRY}/pawfiler/envoy-proxy:latest

echo "=== All images pushed successfully ==="
