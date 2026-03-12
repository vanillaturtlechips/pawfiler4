#!/bin/bash
# Bastion Host 종료 스크립트 (infra.sh 7번 메뉴와 동일)
# 권장: cd terraform && ./infra.sh 사용

set -e

echo "Bastion Host 종료 중..."

terraform destroy -auto-approve -target=module.bastion.aws_instance.bastion

echo ""
echo "Bastion Host 종료 완료!"
