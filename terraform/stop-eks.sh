#!/bin/bash
# EKS 클러스터 종료 스크립트

set -e

echo "🛑 EKS 클러스터 종료 중..."
echo "⚠️  이 작업은 실행 중인 모든 Pod를 종료합니다."
echo ""

read -p "계속하시겠습니까? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "취소되었습니다."
  exit 0
fi

terraform destroy -auto-approve \
  -target=aws_eks_node_group.main \
  -target=aws_eks_cluster.main \
  -target=aws_security_group.eks_cluster

echo ""
echo "✅ EKS 클러스터 종료 완료!"
echo "💰 비용 절감 중..."
