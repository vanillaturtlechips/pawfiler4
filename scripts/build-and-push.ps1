# ECR 설정
$AWS_ACCOUNT_ID = "009946608368"
$AWS_REGION = "ap-northeast-2"
$ECR_REGISTRY = "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# ECR 로그인
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Frontend 빌드 및 푸시
Write-Host "Building frontend..."
Set-Location C:\Users\DS6\Documents\pawfiler\p2\pawfiler4
docker build -t "$ECR_REGISTRY/pawfiler/frontend:latest" .
docker push "$ECR_REGISTRY/pawfiler/frontend:latest"

# Quiz Service 빌드 및 푸시
Write-Host "Building quiz-service..."
Set-Location backend\services\quiz
docker build -t "$ECR_REGISTRY/pawfiler/quiz-service:latest" .
docker push "$ECR_REGISTRY/pawfiler/quiz-service:latest"

# Community Service 빌드 및 푸시
Write-Host "Building community-service..."
Set-Location ..\community
docker build -t "$ECR_REGISTRY/pawfiler/community-service:latest" .
docker push "$ECR_REGISTRY/pawfiler/community-service:latest"

# Video Analysis Service 빌드 및 푸시
Write-Host "Building video-analysis-service..."
Set-Location ..\video-analysis
docker build -t "$ECR_REGISTRY/pawfiler/video-analysis-service:latest" .
docker push "$ECR_REGISTRY/pawfiler/video-analysis-service:latest"

# Envoy Proxy 빌드 및 푸시
Write-Host "Building envoy-proxy..."
Set-Location ..\..\quiz-proxy
docker build -t "$ECR_REGISTRY/pawfiler/envoy-proxy:latest" .
docker push "$ECR_REGISTRY/pawfiler/envoy-proxy:latest"

Write-Host "All images built and pushed successfully!"
