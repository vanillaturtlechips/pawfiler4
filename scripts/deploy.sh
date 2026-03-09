#!/bin/bash
set -e

AWS_REGION=${AWS_REGION:-ap-northeast-2}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME=${CLUSTER_NAME:-pawfiler-eks-cluster}

echo "Deploying to EKS..."

# kubectl 컨텍스트 설정
aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

# Gateway API CRD 설치
echo "Installing Gateway API CRDs..."
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

# Kustomize로 배포
echo "Deploying with Kustomize..."
export AWS_ACCOUNT_ID AWS_REGION
kubectl kustomize k8s/ | envsubst | kubectl apply -f -

echo "Deployment complete!"
echo "Checking pod status..."
kubectl get pods -n pawfiler
