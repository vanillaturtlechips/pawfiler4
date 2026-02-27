#!/bin/bash
set -e

echo "🎯 ArgoCD 설정 시작..."

# ArgoCD admin 비밀번호 가져오기
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)

echo "📝 ArgoCD 로그인 정보:"
echo "  Username: admin"
echo "  Password: $ARGOCD_PASSWORD"

# ArgoCD CLI 로그인
ARGOCD_SERVER=$(kubectl get svc argocd-server -n argocd -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
argocd login $ARGOCD_SERVER --username admin --password $ARGOCD_PASSWORD --insecure

# Git 리포지토리 추가 (필요시 수정)
echo "📦 Git 리포지토리 추가..."
read -p "Git 리포지토리 URL을 입력하세요: " REPO_URL
argocd repo add $REPO_URL

# Application 생성
echo "🚀 ArgoCD Application 생성..."
kubectl apply -f argocd/application.yaml

echo "✅ ArgoCD 설정 완료!"
echo ""
echo "🌐 ArgoCD UI 접속: https://$ARGOCD_SERVER"
echo "   Username: admin"
echo "   Password: $ARGOCD_PASSWORD"
