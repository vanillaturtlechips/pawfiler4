# Terraform Infrastructure Guide

## 📋 개요

이 디렉토리는 PawFiler 프로젝트의 AWS 인프라를 코드로 관리합니다 (Infrastructure as Code).

## 🏗️ 인프라 구성

### 생성되는 리소스

| 리소스 | 파일 | 설명 |
|--------|------|------|
| **VPC & Networking** | `networking.tf` | VPC, 서브넷, NAT Gateway, 라우팅 테이블 |
| **EKS Cluster** | `eks.tf` | Kubernetes 클러스터 및 노드 그룹 |
| **RDS PostgreSQL** | `rds.tf` | 관리형 데이터베이스 |
| **ECR** | `ecr.tf` | Docker 이미지 레지스트리 |
| **IAM** | `iam.tf` | 역할 및 정책 |
| **Bastion Host** | `bastion.tf` | SSH 접근용 EC2 인스턴스 |

### 네트워크 구조

```
VPC (10.0.0.0/16)
├── Public Subnets (10.0.1.0/24, 10.0.3.0/24)
│   ├── Internet Gateway
│   ├── NAT Gateway
│   └── Bastion Host
└── Private Subnets (10.0.101.0/24, 10.0.103.0/24)
    ├── EKS Node Group
    └── RDS PostgreSQL
```

## 🚀 사용 방법

### 1. 사전 준비

#### AWS CLI 설치 및 인증 설정

```bash
# AWS CLI 설치 확인
aws --version

# AWS 자격 증명 설정
aws configure
# AWS Access Key ID: [YOUR_ACCESS_KEY]
# AWS Secret Access Key: [YOUR_SECRET_KEY]
# Default region name: ap-northeast-2
# Default output format: json
```

#### Terraform 설치

```bash
# Windows (Chocolatey)
choco install terraform

# macOS (Homebrew)
brew install terraform

# Linux
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# 설치 확인
terraform version
```

#### EC2 Key Pair 생성 (Bastion Host 접근용)

```bash
# AWS 콘솔에서 생성하거나 CLI로 생성
aws ec2 create-key-pair \
  --key-name pawfiler-bastion-key \
  --query 'KeyMaterial' \
  --output text > pawfiler-bastion-key.pem

chmod 400 pawfiler-bastion-key.pem
```

### 2. 환경 변수 설정

**terraform.tfvars 파일 생성** (Git에 커밋하지 마세요!)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

**terraform.tfvars 내용**:

```hcl
aws_region       = "ap-northeast-2"
project_name     = "pawfiler"
cluster_name     = "pawfiler-eks-cluster"

# 데이터베이스 설정
database_username = "pawfiler"
database_password = "CHANGE_ME_STRONG_PASSWORD"  # 반드시 변경!

# Bastion Host 키 페어
bastion_key_name = "pawfiler-bastion-key"

# 네트워크 설정 (선택사항)
vpc_cidr_block       = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.3.0/24"]
private_subnet_cidrs = ["10.0.101.0/24", "10.0.103.0/24"]

# EKS 노드 설정 (선택사항)
node_instance_types = ["t3.medium"]
node_desired_size   = 2
node_max_size       = 4
node_min_size       = 1
```

### 3. Terraform 실행

```bash
cd terraform

# 1. 초기화 (플러그인 다운로드)
terraform init

# 2. 계획 확인 (실제 적용 전 미리보기)
terraform plan

# 3. 인프라 생성
terraform apply
# "yes" 입력하여 확인

# 4. 출력 값 확인
terraform output

# 5. 특정 출력 값만 보기
terraform output eks_cluster_endpoint
terraform output rds_instance_endpoint
```

### 4. kubectl 설정 (EKS 접근)

```bash
# kubeconfig 업데이트
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name pawfiler-eks-cluster

# 클러스터 연결 확인
kubectl get nodes
kubectl get pods --all-namespaces
```

### 5. 인프라 삭제

```bash
# 모든 리소스 삭제 (주의!)
terraform destroy
# "yes" 입력하여 확인
```

## 📝 주요 변수 설명

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `aws_region` | `ap-northeast-2` | AWS 리전 (서울) |
| `project_name` | `pawfiler` | 프로젝트 이름 (리소스 접두사) |
| `cluster_name` | `pawfiler-eks-cluster` | EKS 클러스터 이름 |
| `database_username` | `pawfiler` | RDS 마스터 사용자명 |
| `database_password` | `dev_password` | RDS 마스터 비밀번호 ⚠️ |
| `database_instance_type` | `db.t3.micro` | RDS 인스턴스 타입 |
| `node_instance_types` | `["t3.medium"]` | EKS 노드 인스턴스 타입 |
| `node_desired_size` | `2` | EKS 노드 희망 개수 |
| `bastion_key_name` | `pawfiler-bastion-key` | Bastion Host SSH 키 |

## 🔐 보안 주의사항

### ⚠️ 절대 Git에 커밋하지 말 것

- `terraform.tfvars` - 민감한 변수 값
- `*.tfstate` - Terraform 상태 파일 (실제 리소스 정보 포함)
- `*.tfstate.backup` - 상태 파일 백업
- `.terraform/` - Terraform 플러그인 디렉토리
- `*.pem` - SSH 키 파일

### .gitignore 확인

```gitignore
# Terraform
**/.terraform/*
*.tfstate
*.tfstate.*
terraform.tfvars
*.pem
*.key
```

### 프로덕션 환경 권장사항

1. **Terraform Backend 설정** (S3 + DynamoDB)
   - 상태 파일을 원격 저장소에 보관
   - 팀원 간 상태 공유
   - 상태 잠금으로 동시 수정 방지

2. **AWS Secrets Manager 사용**
   - 데이터베이스 비밀번호를 Secrets Manager에 저장
   - Terraform에서 참조

3. **환경별 분리**
   - `terraform/environments/dev/`
   - `terraform/environments/staging/`
   - `terraform/environments/prod/`

## 📤 출력 값 (Outputs)

인프라 생성 후 다음 정보를 확인할 수 있습니다:

```bash
terraform output
```

| 출력 | 설명 | 사용처 |
|------|------|--------|
| `vpc_id` | VPC ID | 네트워크 설정 |
| `eks_cluster_endpoint` | EKS API 엔드포인트 | kubectl 설정 |
| `rds_instance_endpoint` | RDS 연결 주소 | 애플리케이션 DATABASE_URL |
| `ecr_repository_urls` | ECR 레포지토리 URL | Docker 이미지 푸시 |
| `bastion_public_ip` | Bastion Host IP | SSH 접근 |

### 애플리케이션에서 사용하기

```bash
# RDS 연결 문자열 생성
export DATABASE_URL="postgresql://pawfiler:PASSWORD@$(terraform output -raw rds_instance_endpoint)/pawfiler_db"

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin $(terraform output -json ecr_repository_urls | jq -r '.quiz_service' | cut -d'/' -f1)
```

## 🔧 트러블슈팅

### 문제: "Error: error configuring Terraform AWS Provider"

**원인**: AWS 자격 증명이 설정되지 않음

**해결**:
```bash
aws configure
# 또는
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### 문제: "Error creating EKS Cluster: InvalidParameterException"

**원인**: 서브넷이 최소 2개의 가용 영역에 분산되지 않음

**해결**: `networking.tf`에서 서브넷이 다른 AZ에 있는지 확인

### 문제: "Error: error creating DB Instance: DBSubnetGroupNotFoundFault"

**원인**: DB 서브넷 그룹이 생성되지 않음

**해결**:
```bash
terraform apply -target=aws_db_subnet_group.main
terraform apply
```

### 문제: Terraform 상태 파일 충돌

**원인**: 여러 팀원이 동시에 `terraform apply` 실행

**해결**: Terraform Backend를 S3 + DynamoDB로 설정하여 상태 잠금 사용

## 🤝 팀 협업 가이드

### 1. 상태 파일 공유 (권장)

**backend.tf 생성**:

```hcl
terraform {
  backend "s3" {
    bucket         = "pawfiler-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "pawfiler-terraform-locks"
    encrypt        = true
  }
}
```

**S3 버킷 및 DynamoDB 테이블 생성**:

```bash
# S3 버킷 생성
aws s3api create-bucket \
  --bucket pawfiler-terraform-state \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# 버전 관리 활성화
aws s3api put-bucket-versioning \
  --bucket pawfiler-terraform-state \
  --versioning-configuration Status=Enabled

# DynamoDB 테이블 생성 (상태 잠금용)
aws dynamodb create-table \
  --table-name pawfiler-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2
```

### 2. 변경 사항 적용 프로세스

1. **변경 전 최신 상태 확인**
   ```bash
   terraform refresh
   ```

2. **계획 검토**
   ```bash
   terraform plan -out=tfplan
   ```

3. **팀원에게 공유 및 리뷰**
   - 계획 출력을 Slack/Discord에 공유
   - 변경 사항 검토

4. **적용**
   ```bash
   terraform apply tfplan
   ```

5. **Git 커밋**
   ```bash
   git add terraform/*.tf
   git commit -m "infra: Update EKS node group size"
   git push
   ```

### 3. 역할 분담

| 역할 | 책임 |
|------|------|
| **인프라 관리자** | Terraform 코드 작성 및 적용 |
| **개발자** | 출력 값 확인 및 애플리케이션 설정 |
| **DevOps** | CI/CD 파이프라인 연동 |

## 💰 비용 예상

### 월 예상 비용 (서울 리전 기준)

| 리소스 | 사양 | 월 비용 (USD) |
|--------|------|---------------|
| EKS Cluster | 제어 플레인 | $73 |
| EC2 (EKS 노드) | t3.medium × 2 | $60 |
| RDS PostgreSQL | db.t3.micro | $15 |
| NAT Gateway | 1개 | $32 |
| EBS 볼륨 | 100GB | $10 |
| **합계** | | **~$190/월** |

**비용 절감 팁**:
- 개발 환경은 업무 시간에만 실행
- Reserved Instances 사용 (1년 약정 시 40% 할인)
- Spot Instances 활용 (EKS 노드)

## 📚 참고 자료

- [Terraform AWS Provider 문서](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS EKS 모범 사례](https://aws.github.io/aws-eks-best-practices/)
- [Terraform 모범 사례](https://www.terraform-best-practices.com/)

## 🆘 도움이 필요하면

1. Terraform 공식 문서 확인
2. 팀 Slack 채널에 질문
3. GitHub Issues에 문제 등록
