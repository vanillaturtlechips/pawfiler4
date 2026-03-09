#!/bin/bash
set -e

# ArgoCD는 Terraform helm.tf에서 이미 설치됨
# 이 스크립트는 CD 레포 연결 + Application 생성만 담당

AWS_REGION=${AWS_REGION:-ap-northeast-2}
CLUSTER_NAME=${CLUSTER_NAME:-pawfiler-eks-cluster}
CD_REPO_URL=${CD_REPO_URL:-""}  # 환경변수 또는 아래 입력

if [ -z "$CD_REPO_URL" ]; then
  read -p "CD 레포 URL (예: https://github.com/org/pawfiler4-argocd): " CD_REPO_URL
fi

echo "EKS kubeconfig 설정..."
aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

echo "ArgoCD 준비 대기 중..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=120s

ARGOCD_SERVER=$(kubectl get svc argocd-server -n argocd -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)

echo "ArgoCD 로그인..."
argocd login $ARGOCD_SERVER \
  --username admin \
  --password $ARGOCD_PASSWORD \
  --insecure

echo "CD 레포 등록..."
argocd repo add $CD_REPO_URL

# App of Apps 패턴: CD 레포의 루트 Application 하나만 등록하면
# CD 레포 안의 다른 Application들이 자동으로 관리됨
echo "Root Application 생성..."
argocd app create pawfiler-root \
  --repo $CD_REPO_URL \
  --path . \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace argocd \
  --sync-policy automated \
  --auto-prune \
  --self-heal

argocd app sync pawfiler-root

echo ""
echo "ArgoCD 설정 완료!"
echo "  UI:       http://$ARGOCD_SERVER"
echo "  Username: admin"
echo "  Password: $ARGOCD_PASSWORD"
echo ""
echo "Gateway URL 확인:"
echo "  kubectl get gateway -n pawfiler"
echo "  kubectl get svc -n envoy-gateway-system"
