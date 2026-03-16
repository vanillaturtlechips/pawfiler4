#!/bin/bash
# Lambda 배포 스크립트

set -e

REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ECR 로그인
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Visual Lambda
echo "Building Visual Lambda..."
docker build -f lambdas/Dockerfile.visual -t pawfiler-visual-lambda .
docker tag pawfiler-visual-lambda:latest ${ECR_REGISTRY}/pawfiler-visual-lambda:latest
docker push ${ECR_REGISTRY}/pawfiler-visual-lambda:latest

# Audio Lambda
echo "Building Audio Lambda..."
docker build -f lambdas/Dockerfile.audio -t pawfiler-audio-lambda .
docker tag pawfiler-audio-lambda:latest ${ECR_REGISTRY}/pawfiler-audio-lambda:latest
docker push ${ECR_REGISTRY}/pawfiler-audio-lambda:latest

echo "✅ Lambda images pushed to ECR"
echo ""
echo "Next steps:"
echo "1. Create Lambda functions in AWS Console"
echo "2. Set image URI: ${ECR_REGISTRY}/pawfiler-visual-lambda:latest"
echo "3. Set memory: 3GB, timeout: 15min"
echo "4. Add IAM role with S3 read access"
