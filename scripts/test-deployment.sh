#!/bin/bash
set -e

echo "🧪 PawFiler 배포 테스트"
echo "======================="

# 사전 체크
echo ""
echo "📋 사전 체크"
echo "------------"

# AWS 자격증명 확인
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ AWS 자격증명이 설정되지 않았습니다"
  exit 1
fi
echo "✅ AWS 자격증명 확인"

# terraform.tfvars 확인
if [ ! -f "terraform/terraform.tfvars" ]; then
  echo "❌ terraform/terraform.tfvars 파일이 없습니다"
  exit 1
fi
echo "✅ terraform.tfvars 존재"

# Terraform 검증
echo ""
echo "🔍 Terraform 검증"
cd terraform
terraform init -upgrade
terraform validate
if [ $? -eq 0 ]; then
  echo "✅ Terraform 설정 유효"
else
  echo "❌ Terraform 설정 오류"
  exit 1
fi

# Terraform Plan
echo ""
echo "📊 Terraform Plan"
terraform plan -out=tfplan
echo ""
read -p "Plan을 확인했습니다. Apply를 진행하시겠습니까? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "테스트 중단"
  exit 0
fi

# Terraform Apply
echo ""
echo "🚀 Terraform Apply (약 15-20분 소요)"
terraform apply tfplan

# EKS 접속 설정
echo ""
echo "🔧 EKS kubeconfig 설정"
aws eks update-kubeconfig --name pawfiler-eks-cluster --region ap-northeast-2

# 노드 확인
echo ""
echo "📦 EKS 노드 확인"
kubectl get nodes
if [ $? -eq 0 ]; then
  echo "✅ EKS 클러스터 접속 성공"
else
  echo "❌ EKS 클러스터 접속 실패"
  exit 1
fi

# Helm 차트 확인
echo ""
echo "📦 Helm 차트 확인"
helm list -A

# ArgoCD 확인
echo ""
echo "🎯 ArgoCD 확인"
kubectl get pods -n argocd
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s

# ArgoCD 비밀번호
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d 2>/dev/null || echo "N/A")

# RDS 엔드포인트
echo ""
echo "📊 RDS 엔드포인트"
RDS_ENDPOINT=$(terraform output -raw rds_instance_address)
echo "RDS: $RDS_ENDPOINT"

# ECR 리포지토리 확인
echo ""
echo "🐳 ECR 리포지토리 확인"
aws ecr describe-repositories --region ap-northeast-2 --query 'repositories[?starts_with(repositoryName, `pawfiler/`)].repositoryName' --output table

# 테스트 결과
echo ""
echo "✅ 배포 테스트 완료!"
echo "===================="
echo ""
echo "📊 배포 정보"
echo "------------"
echo "EKS Cluster: pawfiler-eks-cluster"
echo "RDS Endpoint: $RDS_ENDPOINT"
echo ""
echo "🎯 ArgoCD 접속"
echo "kubectl port-forward -n argocd svc/argocd-server 8080:443"
echo "URL: https://localhost:8080"
echo "Username: admin"
echo "Password: $ARGOCD_PASSWORD"
echo ""
echo "💰 Kubecost 접속"
echo "kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090"
echo "URL: http://localhost:9090"
echo ""
echo "⚠️  다음 단계:"
echo "1. ArgoCD 레포의 db-credentials.yaml 업데이트"
echo "   DB_HOST: $RDS_ENDPOINT"
echo "2. Docker 이미지 빌드 및 푸시"
echo "   cd .. && ./scripts/build-and-push.sh"
echo "3. ArgoCD ApplicationSet 배포"
echo "   kubectl apply -f ~/Documents/finalproject/pawfiler4-argocd/applicationset.yaml"
