#!/bin/bash
# PawFiler AWS 전체 배포 스크립트

set -e

echo "🚀 PawFiler AWS 배포 시작..."

# 1. 인프라 배포
echo "📦 Step 1: Terraform 인프라 배포"
cd terraform
terraform init
terraform apply -auto-approve
cd ..

# 2. EKS 설정
echo "⚙️  Step 2: EKS 클러스터 설정"
AWS_REGION=${AWS_REGION:-ap-northeast-2}
aws eks update-kubeconfig --region $AWS_REGION --name pawfiler-cluster

# 3. Docker 이미지 빌드 및 푸시
echo "🐳 Step 3: Docker 이미지 빌드 및 ECR 푸시"
./scripts/build-and-push.sh

# 4. Kubernetes Secrets 생성 (수동 입력 필요)
echo "🔐 Step 4: Kubernetes Secrets 생성"
echo "다음 명령어를 실행하여 Secrets를 생성하세요:"
echo ""
echo "kubectl create secret generic db-credentials \\"
echo "  --from-literal=quiz-db-url=\"postgresql://USER:PASS@RDS_ENDPOINT:5432/pawfiler\" \\"
echo "  -n pawfiler"
echo ""
read -p "Secrets 생성 완료했나요? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Secrets 생성 후 다시 실행하세요."
    exit 1
fi

# 5. Kubernetes 리소스 배포
echo "☸️  Step 5: Kubernetes 리소스 배포"
./scripts/deploy.sh

# 6. 프론트엔드 빌드 및 배포
echo "🎨 Step 6: 프론트엔드 배포"
npm run build:prod
npm run deploy:s3

echo "✅ 배포 완료!"
echo ""
echo "📊 서비스 상태 확인:"
kubectl get pods -n pawfiler
echo ""
echo "🌐 Ingress 확인:"
kubectl get ingress -n pawfiler
