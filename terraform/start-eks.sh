#!/bin/bash
# EKS 클러스터 시작 스크립트

set -e

echo "🚀 EKS 클러스터 시작 중..."

terraform apply -auto-approve \
  -target=aws_security_group.eks_cluster \
  -target=aws_eks_cluster.main \
  -target=aws_eks_node_group.main

echo ""
echo "⚙️  kubectl 설정 중..."
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster

echo ""
echo "✅ EKS 클러스터 준비 완료!"
echo ""
kubectl get nodes
