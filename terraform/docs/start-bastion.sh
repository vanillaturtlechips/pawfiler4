#!/bin/bash
# Bastion Host 시작 스크립트 (infra.sh 6번 메뉴와 동일)
# 권장: cd terraform && ./infra.sh 사용

set -e

echo "Bastion Host 생성 중..."

terraform apply -auto-approve \
  -target=module.bastion

# EKS가 이미 있는 경우 Access Entry 등록
terraform apply -auto-approve \
  -target=aws_eks_access_entry.bastion \
  -target=aws_eks_access_policy_association.bastion 2>/dev/null || true

BASTION_IP=$(terraform output -raw bastion_public_ip)

echo ""
echo "Bastion Host 준비 완료!"
echo ""
echo "SSH 접속 명령어:"
echo "  ssh -i pawfiler.pem ec2-user@${BASTION_IP}"
echo ""
echo "RDS 접속 (Bastion을 통해):"
echo "  ssh -i pawfiler.pem -L 5432:<RDS_ENDPOINT>:5432 ec2-user@${BASTION_IP}"
echo "  psql -h localhost -U pawfiler -d pawfiler_db"
