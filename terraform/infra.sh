#!/bin/bash

set -e

CLUSTER_NAME="pawfiler-eks-cluster"
REGION="ap-northeast-2"

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_menu() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PawFiler 인프라 관리"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  ${GREEN}[무료 리소스]${NC}"
  echo "  1) 기본 인프라 생성 (VPC, IAM, ECR, S3) - ${GREEN}\$0/월${NC}"
  echo ""
  echo "  ${YELLOW}[유료 리소스]${NC}"
  echo "  2) EKS 시작 - ${YELLOW}\$133/월${NC}"
  echo "  3) EKS 중지"
  echo "  4) RDS 생성 - ${YELLOW}\$15/월${NC}"
  echo "  5) NAT Gateway 생성 - ${YELLOW}\$32/월${NC}"
  echo "  6) Bastion 시작 - ${YELLOW}\$8/월${NC}"
  echo "  7) Bastion 중지"
  echo ""
  echo "  ${BLUE}[일괄 실행]${NC}"
  echo "  8) 전체 배포 (기본 + EKS + RDS + NAT) - ${YELLOW}\$180/월${NC}"
  echo ""
  echo "  ${RED}[위험]${NC}"
  echo "  9) 전체 인프라 삭제 (보호된 리소스 제외)"
  echo ""
  echo "  0) 종료"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -n "선택: "
}

apply_base() {
  echo ""
  echo "${BLUE}🏗️  기본 인프라 생성 중...${NC}"
  echo ""
  echo "📦 생성 대상:"
  echo "  ✅ VPC, Subnets, IGW (무료)"
  echo "  ✅ IAM Roles (무료)"
  echo "  ✅ ECR Repositories 4개 (저장 용량만 과금)"
  echo "  ✅ S3 Buckets 3개 (저장 용량만 과금)"
  echo "  ✅ CloudFront (사용량 기반 과금)"
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
    -target=aws_s3_bucket.frontend \
    -target=aws_s3_bucket.admin_frontend \
    -target=aws_s3_bucket.quiz_media \
    -target=aws_s3_bucket_public_access_block.frontend \
    -target=aws_s3_bucket_public_access_block.admin_frontend \
    -target=aws_s3_bucket_website_configuration.frontend \
    -target=aws_s3_bucket_website_configuration.admin_frontend \
    -target=aws_s3_bucket_policy.frontend \
    -target=aws_s3_bucket_policy.admin_frontend \
    -target=aws_cloudfront_distribution.frontend \
    -target=aws_cloudfront_distribution.admin_frontend
  
  echo ""
  echo "${GREEN}✅ 기본 인프라 생성 완료!${NC}"
  echo ""
  echo "💰 현재 월 비용: ~\$0"
}

start_eks() {
  echo ""
  echo "${BLUE}🚀 EKS 클러스터 시작 중...${NC}"
  echo ""
  
  TEAM_ARNS=(
    "arn:aws:iam::009946608368:user/SGO-Junghan"
    "arn:aws:iam::009946608368:user/SGO-Jaewon"
    "arn:aws:iam::009946608368:user/RAPA_Admin"
    "arn:aws:iam::009946608368:user/SGO-Moonjae"
    "arn:aws:iam::009946608368:user/SGO-LeeMyungil"
  )
  
  terraform apply -auto-approve \
    -target=aws_security_group.eks_cluster \
    -target=aws_eks_cluster.main \
    -target=aws_eks_node_group.main \
    -target=aws_eks_addon.ebs_csi_driver \
    -target=aws_iam_role.bastion \
    -target=aws_iam_instance_profile.bastion \
    -target=aws_security_group.bastion \
    -target=aws_instance.bastion \
    -target=aws_security_group_rule.rds_allow_bastion

  echo ""
  echo "${BLUE}⛵ Helm 릴리즈 설치 중 (Envoy Gateway, ArgoCD, AWS LBC...)${NC}"
  terraform apply -auto-approve \
    -target=helm_release.aws_load_balancer_controller \
    -target=helm_release.argocd \
    -target=helm_release.envoy_gateway \
    -target=helm_release.kubecost \
    -target=helm_release.metrics_server
  
  BASTION_ROLE_ARN=$(terraform output -raw bastion_role_arn 2>/dev/null || echo "")
  if [ -n "$BASTION_ROLE_ARN" ]; then
    TEAM_ARNS+=("$BASTION_ROLE_ARN")
  fi
  
  echo ""
  echo "${BLUE}⚙️  kubectl 설정 중...${NC}"
  aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"
  
  echo ""
  echo "${BLUE}⏳ 노드 Ready 대기 중...${NC}"
  kubectl wait --for=condition=Ready nodes --all --timeout=300s
  
  echo ""
  echo "${BLUE}👥 팀원 Access Entry 등록 중...${NC}"
  for ARN in "${TEAM_ARNS[@]}"; do
    echo "  → $ARN"
    aws eks create-access-entry \
      --cluster-name "$CLUSTER_NAME" \
      --principal-arn "$ARN" \
      --region "$REGION" 2>/dev/null && echo "    ✅ 생성 완료" || echo "    ⏭️  이미 존재"
    
    aws eks associate-access-policy \
      --cluster-name "$CLUSTER_NAME" \
      --principal-arn "$ARN" \
      --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
      --access-scope type=cluster \
      --region "$REGION" 2>/dev/null || true
  done
  
  echo ""
  echo "${GREEN}✅ EKS 클러스터 준비 완료!${NC}"
  kubectl get nodes
  echo ""
  echo "💰 추가 월 비용: +\$133"
}

stop_eks() {
  echo ""
  echo "${YELLOW}🛑 EKS 클러스터 중지 중...${NC}"
  echo ""
  
  terraform destroy -auto-approve \
    -target=aws_eks_node_group.main \
    -target=aws_eks_cluster.main \
    -target=aws_security_group.eks_cluster \
    -target=aws_instance.bastion
  
  echo ""
  echo "${GREEN}✅ EKS 클러스터 중지 완료!${NC}"
  echo ""
  echo "💰 절감 월 비용: -\$133"
}

create_rds() {
  echo ""
  echo "${BLUE}🗄️  RDS 생성 중...${NC}"
  echo ""
  
  terraform apply -auto-approve \
    -target=aws_db_subnet_group.main \
    -target=aws_security_group.rds \
    -target=aws_db_instance.main
  
  echo ""
  echo "${GREEN}✅ RDS 생성 완료!${NC}"
  echo ""
  echo "💰 추가 월 비용: +\$15"
}

create_nat() {
  echo ""
  echo "${BLUE}🌐 NAT Gateway 생성 중...${NC}"
  echo ""
  
  terraform apply -auto-approve \
    -target=aws_eip.nat \
    -target=aws_nat_gateway.main \
    -target=aws_route_table.private \
    -target=aws_route_table_association.private
  
  echo ""
  echo "${GREEN}✅ NAT Gateway 생성 완료!${NC}"
  echo ""
  echo "💰 추가 월 비용: +\$32"
}

start_bastion() {
  echo ""
  echo "${BLUE}🖥️  Bastion 시작 중...${NC}"
  echo ""
  
  terraform apply -auto-approve \
    -target=aws_iam_role.bastion \
    -target=aws_iam_instance_profile.bastion \
    -target=aws_instance.bastion \
    -target=aws_security_group.bastion
  
  echo ""
  echo "${GREEN}✅ Bastion 시작 완료!${NC}"
  terraform output bastion_public_ip
  echo ""
  echo "💰 추가 월 비용: +\$8"
}

stop_bastion() {
  echo ""
  echo "${YELLOW}🛑 Bastion 중지 중...${NC}"
  echo ""
  
  terraform destroy -auto-approve -target=aws_instance.bastion
  
  echo ""
  echo "${GREEN}✅ Bastion 중지 완료!${NC}"
  echo ""
  echo "💰 절감 월 비용: -\$8"
}

destroy_all() {
  echo ""
  echo "${RED}⚠️  경고: 유료 리소스를 모두 삭제합니다!${NC}"
  echo "${RED}보호된 리소스(VPC, IAM, ECR, S3)는 삭제되지 않습니다.${NC}"
  echo ""
  read -p "계속하시겠습니까? (yes/no): " confirm
  confirm=$(echo "$confirm" | xargs)
  
  if [ "$confirm" != "yes" ]; then
    echo "취소되었습니다."
    return
  fi
  
  echo ""
  echo "${YELLOW}🗑️  유료 리소스 삭제 중...${NC}"
  
  terraform destroy -auto-approve \
    -target=aws_eks_node_group.main \
    -target=aws_eks_cluster.main \
    -target=aws_security_group.eks_cluster \
    -target=aws_db_instance.main \
    -target=aws_nat_gateway.main \
    -target=aws_instance.bastion 2>/dev/null || true
  
  echo ""
  echo "${GREEN}✅ 유료 리소스 삭제 완료!${NC}"
  echo ""
  echo "💰 현재 월 비용: ~\$0"
}

deploy_all() {
  echo ""
  echo "${BLUE}🚀 전체 인프라 배포 시작${NC}"
  echo ""
  echo "📦 배포 순서:"
  echo "  1️⃣  기본 인프라 (VPC, IAM, ECR, S3)"
  echo "  2️⃣  NAT Gateway"
  echo "  3️⃣  RDS"
  echo "  4️⃣  EKS + Bastion"
  echo ""
  echo "💰 총 월 비용: \$180"
  echo "⏱️  예상 소요 시간: 15-20분"
  echo ""
  read -p "계속하시겠습니까? (yes/no): " confirm
  confirm=$(echo "$confirm" | xargs)
  
  if [ "$confirm" != "yes" ]; then
    echo "취소되었습니다."
    return
  fi
  
  # 1. 기본 인프라
  echo ""
  echo "${BLUE}[1/4] 기본 인프라 생성 중...${NC}"
  apply_base
  
  # 2. NAT Gateway
  echo ""
  echo "${BLUE}[2/4] NAT Gateway 생성 중...${NC}"
  create_nat
  
  # 3. RDS
  echo ""
  echo "${BLUE}[3/4] RDS 생성 중...${NC}"
  create_rds
  
  # 4. EKS
  echo ""
  echo "${BLUE}[4/4] EKS 클러스터 시작 중...${NC}"
  start_eks
  
  echo ""
  echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "${GREEN}✅ 전체 인프라 배포 완료!${NC}"
  echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "📊 배포된 리소스:"
  echo "  ✅ VPC, Subnets, IGW, NAT"
  echo "  ✅ IAM Roles"
  echo "  ✅ ECR Repositories (4개)"
  echo "  ✅ S3 Buckets (3개)"
  echo "  ✅ RDS PostgreSQL"
  echo "  ✅ EKS Cluster + Nodes"
  echo "  ✅ Bastion Host"
  echo ""
  echo "💰 월 비용: \$180"
  echo ""
  echo "🔗 다음 단계:"
  echo "  1. kubectl get nodes 로 노드 확인"
  echo "  2. ../scripts/build-and-push.sh 로 이미지 빌드"
  echo "  3. kubectl apply -f k8s/ 로 서비스 배포"
}

# 메인 루프
while true; do
  show_menu
  read choice
  
  case $choice in
    1) apply_base ;;
    2) start_eks ;;
    3) stop_eks ;;
    4) create_rds ;;
    5) create_nat ;;
    6) start_bastion ;;
    7) stop_bastion ;;
    8) deploy_all ;;
    9) destroy_all ;;
    0) echo ""; echo "👋 종료합니다."; exit 0 ;;
    *) echo ""; echo "${RED}❌ 잘못된 선택입니다.${NC}" ;;
  esac
  
  echo ""
  read -p "계속하려면 Enter를 누르세요..."
done
