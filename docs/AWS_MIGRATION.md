# PawFiler AWS 마이그레이션 가이드

## 개요
로컬호스트 기반 개발 환경을 AWS EKS로 마이그레이션하는 가이드입니다.

## 아키텍처

```
[CloudFront] → [S3 (Frontend)]
                    ↓
[Route53] → [ALB] → [EKS Cluster]
                    ├─ Quiz Proxy (Node.js)
                    ├─ Quiz Service (Go + gRPC)
                    ├─ Community Service (Go)
                    └─ Video Analysis (Python + gRPC)
                            ↓
                    [RDS PostgreSQL]
                    [SageMaker Endpoint]
```

## 사전 준비

### 1. AWS CLI 설정
```bash
aws configure
# AWS Access Key ID, Secret Access Key, Region 입력
```

### 2. 필요한 도구 설치
```bash
# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# eksctl
curl --silent --location "https://github.com/weksctl/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# envsubst (환경 변수 치환)
sudo apt-get install gettext-base
```

## 배포 단계

### Step 1: Terraform으로 인프라 구축

```bash
cd terraform

# 백엔드 설정 (S3 + DynamoDB)
./setup-backend.sh

# terraform.tfvars 생성
cp terraform.tfvars.example terraform.tfvars
# 파일 편집하여 실제 값 입력

# 인프라 배포 (Helm 차트 포함)
terraform init
terraform plan
terraform apply
```

생성되는 리소스:
- VPC, Subnets, NAT Gateway
- EKS Cluster
- RDS PostgreSQL
- ECR Repositories
- IAM Roles
- Bastion Host
- **Helm 차트 자동 설치:**
  - AWS Load Balancer Controller
  - ArgoCD (GitOps CD)
  - Kubecost (비용 모니터링)
  - Metrics Server (HPA)

### Step 1.5: ArgoCD 설정 (GitOps 사용 시)

```bash
# ArgoCD 초기 설정
./scripts/setup-argocd.sh

# 또는 수동 배포 계속 진행
```

**GitOps 사용 시**: ArgoCD가 Git 리포지토리를 모니터링하여 자동 배포
**수동 배포 시**: 아래 Step 2-4 계속 진행

### Step 2: ECR에 Docker 이미지 푸시

```bash
# 루트 디렉토리에서 실행
./scripts/build-and-push.sh
```

이 스크립트는:
1. 모든 서비스의 Docker 이미지 빌드
2. ECR에 로그인
3. 이미지 태깅 및 푸시

### Step 3: Kubernetes Secrets 생성

```bash
# RDS 연결 정보
kubectl create secret generic db-credentials \
  --from-literal=quiz-db-url="postgresql://username:password@rds-endpoint:5432/pawfiler" \
  -n pawfiler

# SageMaker 엔드포인트
kubectl create secret generic sagemaker-credentials \
  --from-literal=endpoint-url="https://runtime.sagemaker.ap-northeast-2.amazonaws.com/endpoints/deepfind-v3" \
  -n pawfiler
```

### Step 4: Kubernetes 리소스 배포

```bash
# 환경 변수 설정
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-northeast-2
export ACM_CERTIFICATE_ARN="arn:aws:acm:ap-northeast-2:ACCOUNT_ID:certificate/CERT_ID"

# 배포 실행
./scripts/deploy.sh
```

### Step 5: 프론트엔드 S3 + CloudFront 배포

```bash
# 프로덕션 빌드
npm run build

# S3 버킷 생성 (Terraform으로 이미 생성되어 있을 수 있음)
aws s3 mb s3://pawfiler-frontend --region ap-northeast-2

# S3에 업로드
aws s3 sync dist/ s3://pawfiler-frontend --delete

# CloudFront 캐시 무효화
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## 환경 변수 설정

### 프론트엔드 (.env.production)
```
VITE_API_BASE_URL=https://api.pawfiler.com
VITE_QUIZ_API_URL=https://api.pawfiler.com/api/quiz
VITE_COMMUNITY_API_URL=https://api.pawfiler.com/community
VITE_VIDEO_ANALYSIS_API_URL=https://api.pawfiler.com/video
VITE_PAYMENT_API_URL=https://api.pawfiler.com/payment
VITE_USE_MOCK_API=false
VITE_USE_MOCK_AUTH=false
```

### 백엔드 서비스 (Kubernetes Secrets)
- `DATABASE_URL`: RDS PostgreSQL 연결 문자열
- `KAFKA_BOOTSTRAP_SERVERS`: MSK 또는 자체 Kafka 클러스터
- `SAGEMAKER_ENDPOINT`: SageMaker 추론 엔드포인트
- `PORT`: 각 서비스 포트 (기본값 사용 가능)

## 모니터링 및 로깅

### CloudWatch Logs 확인
```bash
# EKS 로그 확인
kubectl logs -f deployment/quiz-service -n pawfiler
kubectl logs -f deployment/community-service -n pawfiler
kubectl logs -f deployment/video-analysis-service -n pawfiler
```

### ArgoCD 배포 상태 확인
```bash
# UI 접속
kubectl port-forward svc/argocd-server -n argocd 8080:443
# https://localhost:8080

# CLI로 확인
argocd app get pawfiler-app
argocd app sync pawfiler-app  # 수동 동기화
```

### Kubecost 비용 모니터링
```bash
# 대시보드 접속
./scripts/kubecost-dashboard.sh
# http://localhost:9090

# 주요 확인 사항:
# - 네임스페이스별 비용 (pawfiler)
# - Pod별 리소스 사용률
# - 비용 절감 권장사항
```

### 서비스 상태 확인
```bash
kubectl get pods -n pawfiler
kubectl get svc -n pawfiler
kubectl get ingress -n pawfiler
```

## 롤백

```bash
# 이전 버전으로 롤백
kubectl rollout undo deployment/quiz-service -n pawfiler

# 특정 리비전으로 롤백
kubectl rollout undo deployment/quiz-service --to-revision=2 -n pawfiler
```

## 비용 최적화

### 개발 환경 중지
```bash
cd terraform
./stop-eks.sh  # EKS 노드 그룹 스케일 다운
./stop-bastion.sh  # Bastion 인스턴스 중지
```

### 개발 환경 재시작
```bash
./start-eks.sh
./start-bastion.sh
```

## 트러블슈팅

### Pod가 시작되지 않을 때
```bash
kubectl describe pod POD_NAME -n pawfiler
kubectl logs POD_NAME -n pawfiler
```

### RDS 연결 실패
- Security Group 확인
- RDS 엔드포인트 확인
- DATABASE_URL 형식 확인

### ALB가 생성되지 않을 때
- AWS Load Balancer Controller 설치 확인
- IAM 권한 확인
- Ingress annotation 확인

## 주요 변경 사항

### 로컬 → AWS 변경점
1. **API 엔드포인트**: localhost → ALB DNS/도메인
2. **데이터베이스**: 로컬 PostgreSQL → RDS
3. **파일 저장**: 로컬 파일시스템 → S3
4. **서비스 디스커버리**: localhost:port → Kubernetes Service DNS
5. **환경 변수**: 하드코딩 → ConfigMap/Secrets

### 코드 변경 최소화
- 환경 변수로 모든 엔드포인트 관리
- Mock API 플래그로 로컬 개발 유지
- 서비스 간 통신은 Kubernetes DNS 활용
