#!/bin/bash
set -e

echo "🚀 PawFiler 자동 배포 스크립트"
echo "================================"

# 1. Terraform 인프라 배포
echo ""
echo "📦 Step 1: Terraform 인프라 배포"
cd terraform

if [ ! -f "terraform.tfvars" ]; then
  echo "❌ terraform.tfvars 파일이 없습니다!"
  exit 1
fi

terraform init
terraform plan
read -p "Terraform apply를 실행하시겠습니까? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  terraform apply -auto-approve
else
  echo "배포 취소됨"
  exit 0
fi

# 2. EKS kubeconfig 설정
echo ""
echo "🔧 Step 2: EKS 접속 설정"
aws eks update-kubeconfig --name pawfiler-eks-cluster --region ap-northeast-2

# 3. RDS 엔드포인트 가져오기
echo ""
echo "📊 Step 3: RDS 엔드포인트 확인"
RDS_ENDPOINT=$(terraform output -raw rds_instance_address)
echo "RDS Endpoint: $RDS_ENDPOINT"

# 4. Docker 이미지 빌드 및 푸시
echo ""
echo "🐳 Step 4: Docker 이미지 빌드 및 ECR 푸시"
cd ..
./scripts/build-and-push.sh

# 5. ArgoCD 레포의 Secret 업데이트 안내
echo ""
echo "⚠️  Step 5: ArgoCD 레포 업데이트 필요"
echo "다음 파일을 수동으로 업데이트하세요:"
echo "  pawfiler4-argocd/apps/base/db-credentials.yaml"
echo "  DB_HOST: $RDS_ENDPOINT"
echo ""
read -p "업데이트 완료 후 Enter를 누르세요..."

# 6. ArgoCD ApplicationSet 배포
echo ""
echo "🎯 Step 6: ArgoCD ApplicationSet 배포"
kubectl apply -f ~/Documents/finalproject/pawfiler4-argocd/applicationset.yaml

# 7. ArgoCD 초기 비밀번호 가져오기
echo ""
echo "🔑 Step 7: ArgoCD 접속 정보"
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
ARGOCD_URL=$(kubectl -n argocd get svc argocd-server -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo ""
echo "✅ 배포 완료!"
echo "================================"
echo "ArgoCD URL: http://$ARGOCD_URL"
echo "Username: admin"
echo "Password: $ARGOCD_PASSWORD"
echo ""
echo "Kubecost: kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090"
echo "Gateway: kubectl get gateway -n pawfiler"
