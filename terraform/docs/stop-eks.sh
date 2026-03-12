#!/bin/bash
# EKS 클러스터 종료 스크립트 (infra.sh 3번 메뉴와 동일)
# 권장: cd terraform && ./infra.sh 사용

set -e

echo "EKS 클러스터 종료 중..."
echo "이 작업은 실행 중인 모든 Pod를 종료합니다."
echo ""

read -p "계속하시겠습니까? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "취소되었습니다."
  exit 0
fi

# Bastion Access Entry 먼저 제거
terraform destroy -auto-approve \
  -target=aws_eks_access_policy_association.bastion \
  -target=aws_eks_access_entry.bastion 2>/dev/null || true

terraform destroy -auto-approve \
  -target=module.helm \
  -target=module.bastion

terraform destroy -auto-approve \
  -target=module.eks

echo ""
echo "EKS 클러스터 종료 완료!"
