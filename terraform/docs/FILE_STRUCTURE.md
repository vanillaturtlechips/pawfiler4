# Terraform 파일 구조 및 역할

## 📁 현재 파일 구조

```
terraform/
├── main.tf              # 진입점 (주석만 있음)
├── providers.tf         # AWS Provider 설정
├── variables.tf         # 공통 변수 정의
├── outputs.tf           # 출력 값 정의
│
├── networking.tf        # VPC, 서브넷, NAT Gateway
├── iam.tf              # IAM 역할 및 정책
├── eks.tf              # EKS 클러스터 및 노드 그룹
├── rds.tf              # PostgreSQL 데이터베이스
├── ecr.tf              # Docker 이미지 레지스트리
├── bastion.tf          # Bastion Host (EC2)
└── rds_variables.tf    # RDS 전용 변수
```

---

## 🔍 각 파일의 역할

### **1. main.tf** - 진입점
- 현재는 주석만 있음
- Terraform 실행 시 자동으로 읽힘

### **2. providers.tf** - Provider 설정
```hcl
provider "aws" {
  region = var.aws_region
}
```
- AWS와 통신하기 위한 설정
- 리전 지정

### **3. variables.tf** - 변수 정의
- 모든 리소스에서 사용하는 공통 변수
- `var.project_name`, `var.aws_region` 등

### **4. outputs.tf** - 출력 값
- 생성된 리소스 정보를 출력
- 다른 시스템에서 참조 가능
- 예: RDS 엔드포인트, EKS 클러스터 이름

---

### **5. networking.tf** - 네트워크 인프라 (🔒 유지)
**생성 리소스**:
- VPC (10.0.0.0/16)
- Public Subnets (2개)
- Private Subnets (2개)
- Internet Gateway
- NAT Gateway
- Route Tables

**특징**:
- ✅ **한 번 생성 후 계속 사용**
- 모든 리소스의 기반
- 삭제하면 모든 것이 영향받음

---

### **6. iam.tf** - IAM 역할 및 정책 (🔒 유지)
**생성 리소스**:
- EKS 클러스터 역할
- EKS 노드 그룹 역할
- 필요한 정책 연결

**특징**:
- ✅ **한 번 생성 후 계속 사용**
- 보안 권한 관리
- EKS가 AWS 리소스에 접근하기 위해 필요

---

### **7. eks.tf** - EKS 클러스터 (🔄 자주 생성/삭제)
**생성 리소스**:
- EKS Cluster (Kubernetes 제어 플레인)
- EKS Node Group (워커 노드)
- Security Group

**특징**:
- 🔄 **개발 중 자주 생성/삭제**
- 비용이 많이 듦 ($73/월 + 노드 비용)
- 테스트 후 삭제하고 필요할 때 재생성

**비용**:
- EKS 제어 플레인: $73/월
- t3.medium 노드 × 2: ~$60/월

---

### **8. rds.tf** - PostgreSQL 데이터베이스 (🔒 유지)
**생성 리소스**:
- RDS PostgreSQL 인스턴스
- DB Subnet Group
- Security Group

**특징**:
- ✅ **한 번 생성 후 계속 사용**
- 데이터가 저장되므로 삭제하면 안 됨
- 스냅샷 백업 권장

**비용**:
- db.t3.micro: ~$15/월

---

### **9. ecr.tf** - Docker 레지스트리 (🔒 유지)
**생성 리소스**:
- ECR Repository (서비스별 7개)
  - quiz-service
  - community-service
  - video-analysis-service
  - auth-service
  - payment-service
  - dashboard-bff
  - envoy-proxy

**특징**:
- ✅ **한 번 생성 후 계속 사용**
- Docker 이미지 저장소
- 이미지가 쌓이므로 유지 필요

**비용**:
- 저장 용량에 따라 과금 (GB당 $0.10/월)

---

### **10. bastion.tf** - Bastion Host (🔄 필요시 생성/삭제)
**생성 리소스**:
- EC2 인스턴스 (t3.micro)
- Security Group
- Elastic IP

**특징**:
- 🔄 **필요할 때만 생성**
- SSH로 Private 서브넷 접근용
- 디버깅/관리 작업 시에만 사용

**비용**:
- t3.micro: ~$8/월

---

## 🎯 권장 전략: Target 옵션 사용

### **영구 리소스 (한 번만 생성)**

```bash
# 네트워크 인프라
terraform apply \
  -target=aws_vpc.main \
  -target=aws_subnet.public \
  -target=aws_subnet.private \
  -target=aws_internet_gateway.main \
  -target=aws_nat_gateway.main \
  -target=aws_route_table.public \
  -target=aws_route_table.private

# IAM 역할
terraform apply \
  -target=aws_iam_role.eks_cluster_role \
  -target=aws_iam_role.eks_node_group_role

# RDS 데이터베이스
terraform apply \
  -target=aws_db_subnet_group.main \
  -target=aws_security_group.rds \
  -target=aws_db_instance.main

# ECR 레지스트리
terraform apply \
  -target=aws_ecr_repository.quiz_service \
  -target=aws_ecr_repository.community_service \
  -target=aws_ecr_repository.video_analysis_service
```

---

### **임시 리소스 (자주 생성/삭제)**

```bash
# EKS 생성 (작업 시작)
terraform apply \
  -target=aws_security_group.eks_cluster \
  -target=aws_eks_cluster.main \
  -target=aws_eks_node_group.main

# EKS 삭제 (작업 종료)
terraform destroy \
  -target=aws_eks_node_group.main \
  -target=aws_eks_cluster.main \
  -target=aws_security_group.eks_cluster

# Bastion 생성 (디버깅 시)
terraform apply -target=aws_instance.bastion

# Bastion 삭제 (작업 완료)
terraform destroy -target=aws_instance.bastion
```

---

## 📊 비용 최적화 전략

### **시나리오 1: 개발 중 (업무 시간만)**

```bash
# 오전 9시 - 작업 시작
terraform apply -target=aws_eks_cluster.main -target=aws_eks_node_group.main

# 오후 6시 - 작업 종료
terraform destroy -target=aws_eks_node_group.main -target=aws_eks_cluster.main
```

**절감 효과**:
- EKS 비용: $133/월 → $40/월 (70% 절감)

---

### **시나리오 2: 주말 제외**

**항상 유지**:
- ✅ VPC, Subnets, NAT Gateway ($32/월)
- ✅ RDS ($15/월)
- ✅ ECR ($5/월)
- ✅ IAM Roles (무료)

**평일만 생성** (8시간 × 22일):
- 🔄 EKS Cluster ($22/월)
- 🔄 EKS Nodes ($18/월)

**월 총 비용: $92** (전체 유지 대비 50% 절감)

---

## 💰 월별 비용 비교

| 시나리오 | EKS | Nodes | RDS | NAT | ECR | 합계 |
|---------|-----|-------|-----|-----|-----|------|
| **24/7 운영** | $73 | $60 | $15 | $32 | $5 | **$185** |
| **업무시간만** | $22 | $18 | $15 | $32 | $5 | **$92** |
| **주말 제외** | $22 | $18 | $15 | $32 | $5 | **$92** |
| **EKS 없음** | $0 | $0 | $15 | $32 | $5 | **$52** |

---

## 🛠️ 실전 사용 예시

### **1. 최초 인프라 구축**

```bash
cd terraform

# 1단계: 영구 리소스 생성
terraform init
terraform apply  # 전체 생성

# 2단계: EKS만 삭제 (비용 절감)
terraform destroy -target=aws_eks_node_group.main -target=aws_eks_cluster.main
```

---

### **2. 일일 작업 루틴**

```bash
# 아침: EKS 시작
terraform apply -target=aws_eks_cluster.main -target=aws_eks_node_group.main

# kubectl 설정
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster

# 저녁: EKS 종료
terraform destroy -target=aws_eks_node_group.main -target=aws_eks_cluster.main
```

---

### **3. 디버깅 시 Bastion 사용**

```bash
# Bastion 생성
terraform apply -target=aws_instance.bastion

# SSH 접속
ssh -i pawfiler-bastion-key.pem ec2-user@$(terraform output -raw bastion_public_ip)

# RDS 접속 테스트
psql -h <RDS_ENDPOINT> -U pawfiler -d pawfiler_db

# 작업 완료 후 삭제
terraform destroy -target=aws_instance.bastion
```

---

## 🚀 빠른 명령어 스크립트

### **start-eks.sh**
```bash
#!/bin/bash
echo "🚀 EKS 클러스터 시작 중..."
terraform apply -auto-approve \
  -target=aws_security_group.eks_cluster \
  -target=aws_eks_cluster.main \
  -target=aws_eks_node_group.main

echo "⚙️  kubectl 설정 중..."
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster

echo "✅ EKS 클러스터 준비 완료!"
kubectl get nodes
```

### **stop-eks.sh**
```bash
#!/bin/bash
echo "🛑 EKS 클러스터 종료 중..."
terraform destroy -auto-approve \
  -target=aws_eks_node_group.main \
  -target=aws_eks_cluster.main \
  -target=aws_security_group.eks_cluster

echo "✅ EKS 클러스터 종료 완료!"
```

---

## 📝 요약

| 리소스 | 파일 | 유지 전략 | 비용 |
|--------|------|-----------|------|
| VPC, Subnets | networking.tf | 🔒 항상 유지 | $32/월 |
| IAM Roles | iam.tf | 🔒 항상 유지 | 무료 |
| RDS | rds.tf | 🔒 항상 유지 | $15/월 |
| ECR | ecr.tf | 🔒 항상 유지 | $5/월 |
| EKS | eks.tf | 🔄 필요시만 | $22/월 (8h) |
| Bastion | bastion.tf | 🔄 필요시만 | $8/월 |
