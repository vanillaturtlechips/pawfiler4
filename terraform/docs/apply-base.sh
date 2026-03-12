#!/bin/bash
# 기본 인프라 생성 스크립트 (infra.sh 1번 메뉴와 동일)
# 권장: cd terraform && ./infra.sh 사용

set -e

echo "기본 인프라 생성 중 (무료/저렴한 리소스만)..."
echo ""
echo "생성 대상:"
echo "  VPC, Subnets, IGW (무료)"
echo "  IAM Roles (무료)"
echo "  ECR Repositories (저장 용량만 과금)"
echo "  S3 Buckets (저장 용량만 과금)"
echo "  CloudFront (사용량 기반 과금)"
echo ""
echo "제외 대상 (비용 발생):"
echo "  NAT Gateway (\$32/월)"
echo "  RDS (\$15/월)"
echo "  EKS (\$133/월)"
echo "  Bastion EC2 (\$8/월)"
echo ""

terraform apply -auto-approve \
  -target=module.networking \
  -target=module.iam \
  -target=module.ecr \
  -target=module.s3

echo ""
echo "기본 인프라 생성 완료!"
echo ""
echo "다음 단계:"
echo "  NAT Gateway 필요시: ./infra.sh -> 5"
echo "  RDS 필요시:         ./infra.sh -> 4"
echo "  EKS 필요시:         ./infra.sh -> 2"
