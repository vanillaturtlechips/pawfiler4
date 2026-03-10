#!/bin/bash
# EKS 클러스터 시작 스크립트 (infra.sh 2번 메뉴와 동일)
# 권장: cd terraform && ./infra.sh 사용

set -e

CLUSTER_NAME="pawfiler-eks-cluster"
REGION="ap-northeast-2"

echo "EKS 클러스터 시작 중..."

terraform apply -auto-approve \
  -target=module.eks \
  -target=module.bastion

echo "Helm 릴리즈 설치 중..."
terraform apply -auto-approve \
  -target=module.helm

# Bastion Role Access Entry (순환 의존성으로 main.tf에 별도 관리)
terraform apply -auto-approve \
  -target=aws_eks_access_entry.bastion \
  -target=aws_eks_access_policy_association.bastion

echo "kubectl 설정 중..."
aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"

echo "노드 Ready 대기 중..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s

echo "EKS 클러스터 준비 완료!"
kubectl get nodes
