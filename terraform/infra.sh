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

# 사용법:
# ./infra.sh - 메뉴 실행
#
# 주의사항:
# 1. terraform.tfvars 설정 필수 (terraform.tfvars.example 참조)
# 2. K8s 배포 후 envoy_alb_domain 업데이트 필요
#    - kubectl get ingress -n pawfiler envoy-ingress
#    - terraform.tfvars에 ALB 도메인 추가
#    - terraform apply -target=module.s3

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
  echo "  5-2) NAT Gateway 중지 (비용 절감)"
  echo "  6) Bastion 시작 - ${YELLOW}\$8/월${NC}"
  echo "  7) Bastion 중지"
  echo ""
  echo "  ${BLUE}[일괄 실행]${NC}"
  echo "  8) 전체 배포 (기본 + EKS + RDS + NAT) - ${YELLOW}\$180/월${NC}"
  echo ""
  echo "  ${BLUE}[K8s 연동]${NC}"
  echo "  10) CloudFront Origin 업데이트 (K8s Envoy NLB 연결)"
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
  echo "${BLUE}기본 인프라 생성 중...${NC}"
  echo ""
  echo "생성 대상:"
  echo "  VPC, Subnets, IGW (무료)"
  echo "  IAM Roles (무료)"
  echo "  ECR Repositories 4개 (저장 용량만 과금)"
  echo "  S3 Buckets 3개 (저장 용량만 과금)"
  echo "  CloudFront (사용량 기반 과금)"
  echo ""

  terraform apply -auto-approve \
    -target=module.networking \
    -target=module.iam \
    -target=module.ecr \
    -target=module.s3

  echo ""
  echo "${GREEN}기본 인프라 생성 완료!${NC}"
  echo ""
  echo "현재 월 비용: ~\$0"
}

start_eks() {
  echo ""
  echo "${BLUE}EKS 클러스터 시작 중...${NC}"
  echo ""

  # EKS + Bastion + 팀원 Access Entry (module.eks 내부)
  terraform apply -auto-approve \
    -target=module.eks \
    -target=module.bastion

  echo ""
  echo "${BLUE}Helm 릴리즈 설치 중 (Envoy Gateway, ArgoCD, AWS LBC...)${NC}"
  terraform apply -auto-approve \
    -target=module.helm

  # Bastion Role Access Entry (순환 의존성으로 main.tf에 별도 관리)
  terraform apply -auto-approve \
    -target=aws_eks_access_entry.bastion \
    -target=aws_eks_access_policy_association.bastion

  echo ""
  echo "${BLUE}kubectl 설정 중...${NC}"
  aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"

  echo ""
  echo "${BLUE}노드 Ready 대기 중...${NC}"
  kubectl wait --for=condition=Ready nodes --all --timeout=300s

  echo ""
  echo "${GREEN}EKS 클러스터 준비 완료!${NC}"
  kubectl get nodes
  echo ""
  echo "추가 월 비용: +\$133"
}

stop_eks() {
  echo ""
  echo "${YELLOW}EKS 클러스터 중지 중...${NC}"
  echo ""

  # Bastion Access Entry 먼저 제거 (EKS 삭제 전)
  terraform destroy -auto-approve \
    -target=aws_eks_access_policy_association.bastion \
    -target=aws_eks_access_entry.bastion 2>/dev/null || true

  terraform destroy -auto-approve \
    -target=module.helm \
    -target=module.bastion

  terraform destroy -auto-approve \
    -target=module.eks

  echo ""
  echo "${GREEN}EKS 클러스터 중지 완료!${NC}"
  echo ""
  echo "절감 월 비용: -\$133"
}

create_rds() {
  echo ""
  echo "${BLUE}RDS 생성 중...${NC}"
  echo ""

  terraform apply -auto-approve \
    -target=module.rds

  echo ""
  echo "${GREEN}RDS 생성 완료!${NC}"
  echo ""
  echo "추가 월 비용: +\$15"
}

create_nat() {
  echo ""
  echo "${BLUE}NAT Gateway 생성 중...${NC}"
  echo ""

  terraform apply -auto-approve \
    -target=module.networking.aws_eip.nat_gateway \
    -target=module.networking.aws_nat_gateway.main \
    -target=module.networking.aws_route_table.private \
    -target=module.networking.aws_route_table_association.private

  echo ""
  echo "${GREEN}NAT Gateway 생성 완료!${NC}"
  echo ""
  echo "추가 월 비용: +\$32"
}

stop_nat() {
  echo ""
  echo "${YELLOW}NAT Gateway 중지 중...${NC}"
  echo ""
  echo "${RED}주의: Private 서브넷의 인터넷 연결이 끊깁니다.${NC}"
  read -p "계속하시겠습니까? (yes/no): " confirm
  confirm=$(echo "$confirm" | xargs)

  if [ "$confirm" != "yes" ]; then
    echo "취소되었습니다."
    return
  fi

  terraform destroy -auto-approve \
    -target=module.networking.aws_nat_gateway.main \
    -target=module.networking.aws_eip.nat_gateway

  echo ""
  echo "${GREEN}NAT Gateway 중지 완료!${NC}"
  echo ""
  echo "절감 월 비용: -\$32"
}

start_bastion() {
  echo ""
  echo "${BLUE}Bastion 시작 중...${NC}"
  echo ""

  terraform apply -auto-approve \
    -target=module.bastion

  # EKS가 이미 있는 경우 Access Entry 등록
  terraform apply -auto-approve \
    -target=aws_eks_access_entry.bastion \
    -target=aws_eks_access_policy_association.bastion 2>/dev/null || true

  echo ""
  echo "${GREEN}Bastion 시작 완료!${NC}"
  terraform output bastion_public_ip
  echo ""
  echo "추가 월 비용: +\$8"
}

stop_bastion() {
  echo ""
  echo "${YELLOW}Bastion 중지 중...${NC}"
  echo ""

  terraform destroy -auto-approve -target=module.bastion.aws_instance.bastion

  echo ""
  echo "${GREEN}Bastion 중지 완료!${NC}"
  echo ""
  echo "절감 월 비용: -\$8"
}

destroy_all() {
  echo ""
  echo "${RED}경고: 유료 리소스를 모두 삭제합니다!${NC}"
  echo "${RED}보호된 리소스(VPC, IAM, ECR, S3)는 삭제되지 않습니다.${NC}"
  echo ""
  read -p "계속하시겠습니까? (yes/no): " confirm
  confirm=$(echo "$confirm" | xargs)

  if [ "$confirm" != "yes" ]; then
    echo "취소되었습니다."
    return
  fi

  echo ""
  echo "${YELLOW}유료 리소스 삭제 중...${NC}"

  terraform destroy -auto-approve \
    -target=aws_eks_access_policy_association.bastion \
    -target=aws_eks_access_entry.bastion 2>/dev/null || true

  terraform destroy -auto-approve \
    -target=module.helm \
    -target=module.bastion 2>/dev/null || true

  terraform destroy -auto-approve \
    -target=module.eks \
    -target=module.rds \
    -target=module.networking.aws_nat_gateway.main \
    -target=module.networking.aws_eip.nat_gateway 2>/dev/null || true

  echo ""
  echo "${GREEN}유료 리소스 삭제 완료!${NC}"
  echo ""
  echo "현재 월 비용: ~\$0"
}

deploy_all() {
  echo ""
  echo "${BLUE}전체 인프라 배포 시작${NC}"
  echo ""
  echo "배포 순서:"
  echo "  1  기본 인프라 (VPC, IAM, ECR, S3)"
  echo "  2  NAT Gateway"
  echo "  3  RDS"
  echo "  4  EKS + Bastion"
  echo ""
  echo "총 월 비용: \$180"
  echo "예상 소요 시간: 15-20분"
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
  echo "${GREEN}전체 인프라 배포 완료!${NC}"
  echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "배포된 리소스:"
  echo "  VPC, Subnets, IGW, NAT"
  echo "  IAM Roles"
  echo "  ECR Repositories (4개)"
  echo "  S3 Buckets (3개)"
  echo "  RDS PostgreSQL"
  echo "  EKS Cluster + Nodes"
  echo "  Bastion Host"
  echo ""
  echo "월 비용: \$180"
  echo ""
  echo "다음 단계:"
  echo "  1. kubectl get nodes 로 노드 확인"
  echo "  2. ../scripts/build-and-push.sh 로 이미지 빌드"
  echo "  3. kubectl apply -f k8s/ 로 서비스 배포"
}

update_cloudfront_origin() {
  echo ""
  echo "${BLUE}CloudFront Origin 업데이트${NC}"
  echo ""
  echo "K8s Envoy ALB 도메인을 CloudFront Origin으로 연결합니다."
  echo ""

  # 현재 설정 확인
  CURRENT_DOMAIN=$(grep "envoy_alb_domain" terraform.tfvars 2>/dev/null | cut -d'"' -f2)

  if [ -z "$CURRENT_DOMAIN" ] || [ "$CURRENT_DOMAIN" == "" ]; then
    echo "${YELLOW}terraform.tfvars에 envoy_alb_domain이 설정되지 않았습니다.${NC}"
    echo ""
    echo "1. K8s에 Envoy 배포:"
    echo "   kubectl apply -f ../k8s/envoy-proxy.yaml"
    echo "   kubectl apply -f ../k8s/proto-configmap.yaml"
    echo "   kubectl apply -f ../k8s/envoy-ingress.yaml"
    echo ""
    echo "2. ALB 도메인 확인:"
    echo "   kubectl get ingress -n pawfiler envoy-ingress"
    echo ""
    echo "3. terraform.tfvars에 추가:"
    echo "   envoy_alb_domain = \"k8s-pawfiler-envoying-xxx.elb.ap-northeast-2.amazonaws.com\""
    echo ""
    read -p "계속하시겠습니까? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
      echo "취소되었습니다."
      return
    fi
  else
    echo "현재 설정: ${GREEN}$CURRENT_DOMAIN${NC}"
    echo ""
  fi

  echo "CloudFront 업데이트 중..."
  terraform apply -target=module.s3 -auto-approve

  echo ""
  echo "${GREEN}CloudFront Origin 업데이트 완료!${NC}"
  echo ""
  echo "프론트엔드 URL:"
  terraform output frontend_cloudfront_url
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
    "5-2") stop_nat ;;
    6) start_bastion ;;
    7) stop_bastion ;;
    8) deploy_all ;;
    9) destroy_all ;;
    10) update_cloudfront_origin ;;
    0) echo ""; echo "종료합니다."; exit 0 ;;
    *) echo ""; echo "${RED}잘못된 선택입니다.${NC}" ;;
  esac

  echo ""
  read -p "계속하려면 Enter를 누르세요..."
done
