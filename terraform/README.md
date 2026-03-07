# Terraform 인프라 관리

## 🚀 빠른 시작 (순서대로 실행)

### 1단계: 초기 설정

```bash
cd terraform
terraform init

# terraform.tfvars 설정
cp terraform.tfvars.example terraform.tfvars
# database_password, bastion_key_name 등 수정
```

### 2단계: 무료 인프라 생성 (필수) - infra.sh 에서 번호 선택하면 원하는 테라폼 설치!!!!!

```bash
./infra.sh
# 선택: 1) 기본 인프라 생성
```

**생성되는 것**: VPC, IAM, ECR, S3  
**비용**: $0/월  
**삭제 방지**: ✅ (실수로 삭제 불가)

### 3단계: 배포 테스트 시 (선택)

#### EKS + Bastion 시작

```bash
./infra.sh
# 선택: 2) EKS 시작 (Bastion 포함)
```

**비용**: $133/월 (EKS) + $8/월 (Bastion)  
**소요 시간**: 약 10분

#### RDS 생성 (DB 필요시)

```bash
./infra.sh
# 선택: 4) RDS 생성
```

**비용**: $15/월  
**소요 시간**: 약 5분

#### NAT Gateway (Private 서브넷 인터넷 필요시)

```bash
./infra.sh
# 선택: 5) NAT Gateway 생성
```

**비용**: $32/월

### 4단계: 작업 완료 후 비용 절감

```bash
./infra.sh
# 선택: 3) EKS 중지
# 선택: 7) Bastion 중지
```

## 📋 시나리오별 가이드

### 시나리오 1: 로컬 개발만

```bash
# 1단계만 실행
./infra.sh → 1) 기본 인프라 생성
```

**월 비용**: ~$0

### 시나리오 2: 백엔드 배포 테스트

```bash
# 1단계 + EKS
./infra.sh → 1) 기본 인프라 생성
./infra.sh → 2) EKS 시작
./infra.sh → 4) RDS 생성

# 테스트 완료 후
./infra.sh → 3) EKS 중지
```

**테스트 중 비용**: $148/월  
**테스트 후 비용**: $15/월 (RDS만)

### 시나리오 3: 프론트엔드만 배포

```bash
# 1단계만 실행 (S3 생성됨)
./infra.sh → 1) 기본 인프라 생성

# 프론트엔드 배포
cd ..
./scripts/deploy-frontend.sh
```

**월 비용**: ~$0

### 시나리오 4: 전체 배포 (프로덕션) - 한 번에!

```bash
./infra.sh → 8) 전체 배포
```

**배포 순서**: 기본 인프라 → NAT → RDS → EKS  
**소요 시간**: 15-20분  
**월 비용**: $180/월

## 📋 메뉴 구성

### 무료 리소스 ($0/월)

- VPC, Subnets, Internet Gateway
- IAM Roles
- ECR Repositories (4개)
- S3 Buckets (3개)

### 유료 리소스 (필요시만)

- EKS Cluster: $133/월
- RDS PostgreSQL: $15/월
- NAT Gateway: $32/월
- Bastion EC2: $8/월

## 🔒 삭제 방지

중요 리소스는 `prevent_destroy`로 보호됩니다:

- VPC, IAM Roles, ECR, S3

실수로 삭제 시도 시 에러 발생:

```
Error: Instance cannot be destroyed
Resource has lifecycle.prevent_destroy set
```

## 📁 파일 구조

```
terraform/
├── infra.sh              # 통합 관리 스크립트 ⭐
├── networking.tf         # VPC, Subnets
├── iam.tf               # IAM Roles
├── eks.tf               # EKS Cluster
├── rds.tf               # PostgreSQL
├── ecr.tf               # Docker Registry
├── s3-frontend.tf       # Frontend Hosting
├── s3-media.tf          # Media Storage
├── bastion.tf           # Bastion Host
└── docs/                # 참고 문서
```

## 💡 일반적인 워크플로우

### 매일 작업 루틴

```bash
# 아침 - 작업 시작
./infra.sh → 2) EKS 시작

# 저녁 - 작업 종료
./infra.sh → 3) EKS 중지
```

**절감 효과**: 8시간만 사용 시 월 $133 → $40

### 디버깅 필요시

```bash
# Bastion으로 Private 리소스 접근
./infra.sh → 6) Bastion 시작

# SSH 접속
ssh -i ~/.ssh/pawfiler-bastion-key.pem ec2-user@<BASTION_IP>

# 작업 완료
./infra.sh → 7) Bastion 중지
```

### 주말/휴가 전

```bash
# 모든 유료 리소스 중지
./infra.sh → 3) EKS 중지
./infra.sh → 7) Bastion 중지

# RDS는 데이터 보존을 위해 유지 권장
```

## 📚 참고 문서

- [docs/FILE_STRUCTURE.md](./docs/FILE_STRUCTURE.md) - 상세 파일 구조
- [docs/PREVENT_DESTROY.md](./docs/PREVENT_DESTROY.md) - 삭제 방지 정책
- [docs/EKS_IAM_SETUP.md](./docs/EKS_IAM_SETUP.md) - EKS IAM 설정
- [docs/CHEATSHEET.md](./docs/CHEATSHEET.md) - 명령어 치트시트
- [docs/STATUS.md](./docs/STATUS.md) - 현재 인프라 상태

## ⚠️ 주의사항

1. **terraform.tfvars 설정 필수**

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # database_password 등 수정
   ```

2. **AWS 자격증명 필요**

   ```bash
   aws configure
   ```

3. **비용 모니터링**
   - AWS Cost Explorer에서 일일 비용 확인
   - 사용하지 않는 리소스는 즉시 중지

## 🆘 문제 해결

### State Lock 에러

```bash
terraform force-unlock <LOCK_ID>
```

### kubectl 연결 안됨

```bash
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
```

### EBS CSI Driver CrashLoopBackOff

```bash
# IAM 정책 재적용
terraform apply -target=aws_iam_role_policy_attachment.ebs_csi_driver -auto-approve

# Pod 재시작
kubectl delete pods -n kube-system -l app=ebs-csi-controller
```

### 리소스 삭제 실패

보호된 리소스는 코드에서 `lifecycle` 블록 제거 후 삭제 가능
