#!/bin/bash
# Bastion Host 종료 스크립트

set -e

echo "🛑 Bastion Host 종료 중..."

terraform destroy -auto-approve -target=aws_instance.bastion

echo ""
echo "✅ Bastion Host 종료 완료!"
