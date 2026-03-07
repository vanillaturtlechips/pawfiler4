# Terraform 인프라 관리

## 🚀 빠른 시작

### 1. 초기 설정

```bash
cd terraform
terraform init

# 설정 파일 생성
cp terraform.tfvars.example terraform.tfvars
# database_password, bastion_key_name, envoy_nlb_domain 수정
```

### 2. 기본 인프라 생성 (무료)

```bash
./infra.sh
# 선택: 1) 기본 인프라 생성
```

**생성**: VPC, IAM, ECR, S3  
**비용**: $0/월

### 3. K8s 배포 후 Envoy NLB 도메인 설정

```bash
# K8s에 Envoy 배포 후
kubectl get svc -n pawfiler envoy-proxy

# EXTERNAL-IP를 terraform.tfvars에 추가
# envoy_nlb_domain = "k8s-pawfiler-envoypro-xxx.elb.ap-northeast-2.amazonaws.com"

# CloudFront 업데이트
terraform apply -target=aws_cloudfront_distribution.frontend
```

### 4. 배포 테스트 시

```bash
./infra.sh
# 2) EKS 시작
# 4) RDS 생성
# 5) NAT Gateway 생성 (Private 서브넷 인터넷 필요시)
```

### 5. 작업 완료 후

```bash
./infra.sh
# 3) EKS 중지
# 7) Bastion 중지
```

## 📋 주요 리소스

### 무료 ($0/월)
- VPC, IAM Roles
- ECR (4개): quiz, community, admin, video-analysis
- S3 (3개): frontend, admin-frontend, quiz-media
- CloudFront (2개): frontend, quiz-media

### 유료 (필요시)
- EKS: $133/월
- RDS: $15/월
- NAT Gateway: $32/월
- Bastion: $8/월

## 🔧 주요 설정

### IRSA (IAM Roles for Service Accounts)
- Admin 서비스가 S3에 업로드하기 위한 권한
- `terraform/irsa.tf` 참조

### CloudFront Origins
- Frontend: S3 (정적 파일)
- API Backend: Envoy NLB (gRPC-JSON transcoding)

## 📁 주요 파일

```
terraform/
├── infra.sh                    # 통합 관리 스크립트
├── terraform.tfvars.example    # 설정 예시
├── common-variables.tf         # 변수 정의
├── irsa.tf                     # Admin S3 권한
├── s3-frontend.tf              # Frontend + CloudFront
├── s3-media.tf                 # Quiz Media + CloudFront
└── eks.tf, rds.tf, ...
```

## 💡 워크플로우

### 개발 중
```bash
# 아침
./infra.sh → 2) EKS 시작

# 저녁
./infra.sh → 3) EKS 중지
```

### 프론트엔드만 배포
```bash
cd ../frontend
npm run build
aws s3 sync dist/ s3://pawfiler-frontend --delete
aws cloudfront create-invalidation --distribution-id E1YU8EA9X822Q1 --paths "/*"
```

### DB 접속 (Bastion 경유)
```bash
./infra.sh → 6) Bastion 시작
ssh -i ~/.ssh/pawfiler-bastion-key.pem ec2-user@<BASTION_IP>
psql -h <RDS_ENDPOINT> -U pawfiler -d pawfiler_db
```

## ⚠️ 주의사항

1. **terraform.tfvars 필수 설정**
   - `database_password`: RDS 비밀번호
   - `bastion_key_name`: EC2 키페어 이름
   - `envoy_nlb_domain`: K8s Envoy 서비스 도메인

2. **Envoy NLB 도메인 업데이트**
   - K8s에 Envoy 배포 후 `kubectl get svc`로 확인
   - `terraform.tfvars`에 추가 후 CloudFront 업데이트

3. **비용 모니터링**
   - 사용하지 않는 리소스는 즉시 중지
   - AWS Cost Explorer 확인

## 🆘 문제 해결

### kubectl 연결 안됨
```bash
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
```

### State Lock 에러
```bash
terraform force-unlock <LOCK_ID>
```

### CloudFront 캐시 무효화
```bash
aws cloudfront create-invalidation --distribution-id E1YU8EA9X822Q1 --paths "/*"
```
