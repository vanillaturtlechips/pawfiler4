# Terraform 인프라 관리

## 📁 구조

```
terraform/
├── main.tf              # 모듈 호출
├── variables.tf         # 루트 변수
├── outputs.tf           # 루트 outputs
├── moved.tf             # 리소스 이동 매핑 (모듈화 마이그레이션용)
├── backend.tf           # S3 + DynamoDB 백엔드
├── providers.tf         # AWS, Helm, Kubernetes 프로바이더
├── terraform.tfvars     # 실제 값 (gitignored)
├── infra.sh             # 인프라 관리 스크립트
│
└── modules/
    ├── networking/      # VPC, Subnets, IGW, NAT
    ├── iam/             # IAM Roles (EKS, Bastion)
    ├── eks/             # EKS Cluster, Node Groups, Access Entries
    ├── rds/             # PostgreSQL Database
    ├── ecr/             # Container Registries
    ├── s3/              # S3 Buckets (Frontend, Media)
    ├── bastion/         # Bastion Host
    ├── helm/            # Helm Releases (ArgoCD, Envoy, Kubecost, etc)
    ├── irsa/            # IRSA for K8s Services
    └── karpenter/       # Karpenter Autoscaler (optional)
```

## 🚀 빠른 시작

### 1. 초기 설정

```bash
cd terraform

# Terraform 초기화
terraform init

# 설정 파일 생성
cp terraform.tfvars.example terraform.tfvars

# 필수 값 입력
# - bastion_key_name: EC2 Key Pair 이름
# - database_password: RDS 비밀번호
vim terraform.tfvars
```

### 2. 인프라 배포

```bash
# 대화형 메뉴 실행
./infra.sh

# 또는 직접 실행
terraform plan
terraform apply
```

## 📋 infra.sh 메뉴

```
[무료 리소스]
1) 기본 인프라 생성 (VPC, IAM, ECR, S3) - $0/월

[유료 리소스]
2) EKS 시작 - $133/월
3) EKS 중지
4) RDS 생성 - $15/월
5) NAT Gateway 생성 - $32/월
6) Bastion 시작 - $8/월
7) Bastion 중지

[일괄 실행]
8) 전체 배포 (기본 + EKS + RDS + NAT) - $180/월

[K8s 연동]
10) CloudFront Origin 업데이트 (K8s Envoy ALB 연결)

[위험]
9) 전체 인프라 삭제 (보호된 리소스 제외)
```

## 🔧 주요 변수

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `bastion_key_name` | EC2 Key Pair 이름 | - | ✅ |
| `database_password` | RDS 비밀번호 | - | ✅ |
| `envoy_alb_domain` | Envoy ALB 도메인 | "" | ❌ |
| `enable_karpenter` | Karpenter 활성화 | false | ❌ |
| `project_name` | 프로젝트 이름 | "pawfiler" | ❌ |
| `aws_region` | AWS 리전 | "ap-northeast-2" | ❌ |
| `eks_version` | EKS 버전 | "1.31" | ❌ |

## 💰 비용 예상

| 리소스 | 월 비용 | 설명 |
|--------|---------|------|
| EKS Cluster | $73 | Control Plane |
| Node Groups | $32 | t3.medium (Spot + On-Demand) |
| ALB | $20 | Application Load Balancer |
| NAT Gateway | $32 | Private Subnet 인터넷 |
| RDS | $15 | db.t3.micro PostgreSQL |
| **총계** | **~$172/월** | |

## 🔐 보안 주의사항

### ⚠️ 공개 리포지토리 주의

이 리포지토리는 **공개**되어 있습니다. 다음 사항을 반드시 확인하세요:

1. **절대 커밋하지 말 것:**
   - `terraform.tfvars` (gitignored)
   - `*.pem`, `*.key` (SSH 키)
   - AWS Access Key/Secret Key
   - 데이터베이스 비밀번호
   - 기타 민감 정보

2. **안전하게 관리:**
   - `terraform.tfvars.example`만 커밋
   - 실제 값은 팀 내부 문서로 공유
   - AWS Secrets Manager 사용 권장

3. **이미 커밋된 경우:**
   ```bash
   # Git 히스토리에서 완전 삭제
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch terraform/terraform.tfvars" \
     --prune-empty --tag-name-filter cat -- --all
   
   # 강제 푸시
   git push origin --force --all
   
   # 노출된 키는 즉시 교체
   ```

## 🎯 Karpenter 설정

### 현재 상태
- **비활성화** (`enable_karpenter = false`)
- **이유:** itcen SCP가 Karpenter Controller Role의 `ec2:RunInstances` 차단

### 활성화 방법

1. **itcen에 SCP 예외 요청**
   - Role ARN: `arn:aws:iam::009946608368:role/pawfiler-karpenter-controller`
   - 필요 권한: `ec2:RunInstances` (2xlarge 이상 인스턴스만)

2. **승인 후 활성화**
   ```bash
   # terraform.tfvars
   enable_karpenter = true
   
   # 적용
   terraform apply
   
   # NodePool 생성
   kubectl apply -f ../k8s/karpenter-nodepool.yaml
   ```

### 대안: Managed Node Groups
- 현재 사용 중: Spot + On-Demand 혼합
- 안정적이고 SCP 제약 없음
- Karpenter 없이도 충분히 사용 가능

## 📚 추가 문서

- [K8s 배포 가이드](../k8s/README.md)
- [Karpenter 설치 가이드](../docs/KARPENTER.md)
- [ALB 마이그레이션](../docs/TROUBLESHOOTING-ALB.md)

## 🆘 문제 해결

### State Lock 에러
```bash
# Lock ID 확인
terraform plan  # 에러 메시지에서 Lock ID 복사

# 강제 해제
terraform force-unlock <LOCK_ID>
```

### 모듈 초기화 에러
```bash
terraform init -upgrade
```

### EKS Access 권한 없음
```bash
# kubeconfig 업데이트
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster

# Access Entry 확인
aws eks list-access-entries --cluster-name pawfiler-eks-cluster
```

## 👥 팀원 추가

EKS 클러스터 접근 권한은 `infra.sh`의 `start_eks()` 함수에서 자동으로 추가됩니다.

새 팀원 추가:
```bash
# infra.sh 수정
TEAM_ARNS=(
  "arn:aws:iam::009946608368:user/NEW_USER"
  ...
)

# EKS 재시작 또는 수동 추가
aws eks create-access-entry \
  --cluster-name pawfiler-eks-cluster \
  --principal-arn arn:aws:iam::009946608368:user/NEW_USER

aws eks associate-access-policy \
  --cluster-name pawfiler-eks-cluster \
  --principal-arn arn:aws:iam::009946608368:user/NEW_USER \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster
```

## 🔄 마이그레이션 노트

### 모듈화 완료 (2026-03-09)
- 기존 단일 파일 → 12개 모듈로 분리
- `moved.tf`로 리소스 이동 매핑 (state 유지)
- 기존 인프라 영향 없음

### 변경 사항
- ✅ 중복 제거 (EKS Access Entry, OIDC Provider)
- ✅ 파일 정리 (helm-outputs.tf, bastion-variables.tf 삭제)
- ✅ 변수 통합 (common-variables.tf → variables.tf)
- ✅ 모듈별 독립성 확보

## 📞 문의

- Terraform 관련: 인프라 팀
- Karpenter SCP: itcen 담당자
- K8s 배포: DevOps 팀
