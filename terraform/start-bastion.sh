#!/bin/bash
# Bastion Host 시작 스크립트

set -e

echo "🔧 Bastion Host 생성 중..."

terraform apply -auto-approve -target=aws_instance.bastion

BASTION_IP=$(terraform output -raw bastion_public_ip)

echo ""
echo "✅ Bastion Host 준비 완료!"
echo ""
echo "SSH 접속 명령어:"
echo "  ssh -i pawfiler-bastion-key.pem ec2-user@${BASTION_IP}"
echo ""
echo "RDS 접속 (Bastion을 통해):"
echo "  ssh -i pawfiler-bastion-key.pem -L 5432:<RDS_ENDPOINT>:5432 ec2-user@${BASTION_IP}"
echo "  psql -h localhost -U pawfiler -d pawfiler_db"
