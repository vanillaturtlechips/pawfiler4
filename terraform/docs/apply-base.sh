#!/bin/bash

set -e

echo "🏗️  기본 인프라 생성 중 (무료/저렴한 리소스만)..."
echo ""
echo "📦 생성 대상:"
echo "  ✅ VPC, Subnets, IGW (무료)"
echo "  ✅ IAM Roles (무료)"
echo "  ✅ ECR Repositories (저장 용량만 과금)"
echo "  ✅ S3 Buckets (저장 용량만 과금)"
echo ""
echo "❌ 제외 대상 (비용 발생):"
echo "  ⏭️  NAT Gateway ($32/월)"
echo "  ⏭️  RDS ($15/월)"
echo "  ⏭️  EKS ($133/월)"
echo "  ⏭️  Bastion EC2 ($8/월)"
echo ""

terraform apply -auto-approve \
  -target=aws_vpc.main \
  -target=aws_subnet.public \
  -target=aws_subnet.private \
  -target=aws_internet_gateway.main \
  -target=aws_route_table.public \
  -target=aws_route_table_association.public \
  -target=aws_iam_role.eks_cluster_role \
  -target=aws_iam_role.eks_node_group_role \
  -target=aws_iam_role_policy_attachment.eks_cluster_policy \
  -target=aws_iam_role_policy_attachment.eks_node_AmazonEKSWorkerNodePolicy \
  -target=aws_iam_role_policy_attachment.eks_node_AmazonEKS_CNI_Policy \
  -target=aws_iam_role_policy_attachment.eks_node_AmazonEC2ContainerRegistryReadOnly \
  -target=aws_ecr_repository.quiz_service \
  -target=aws_ecr_repository.community_service \
  -target=aws_ecr_repository.video_analysis_service \
  -target=aws_ecr_repository.admin_service \
  -target=aws_ecr_repository.auth_service \
  -target=aws_ecr_repository.payment_service \
  -target=aws_ecr_repository.dashboard_bff \
  -target=aws_s3_bucket.frontend \
  -target=aws_s3_bucket.admin_frontend \
  -target=aws_s3_bucket.media \
  -target=aws_cloudfront_distribution.frontend \
  -target=aws_cloudfront_distribution.admin_frontend

echo ""
echo "✅ 기본 인프라 생성 완료!"
echo ""
echo "💡 다음 단계:"
echo "  1. NAT Gateway 필요시: terraform apply -target=aws_nat_gateway.main"
echo "  2. RDS 필요시: terraform apply -target=aws_db_instance.main"
echo "  3. EKS 필요시: ./start-eks.sh"
