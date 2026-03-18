# 인프라 현황

## ✅ 생성 완료 (항상 유지 - 무료/저렴)

### 네트워크 (무료)

- VPC: `vpc-0e9dade637c64f650`
- Public Subnets: 2개
- Private Subnets: 2개
- Internet Gateway
- Route Tables

### IAM (무료)

- EKS Cluster Role: `pawfiler-eks-cluster-role`
- EKS Node Group Role: `pawfiler-eks-node-group-role`

### 저장소 (저장 용량만 과금)

- ECR Repositories: 5개
  - pawfiler/quiz-service
  - pawfiler/community-service
  - pawfiler/video-analysis-service
  - pawfiler/admin-service
  - pawfiler/report-lambda ← Lambda 전환으로 신규 추가
- S3 Buckets: 4개
  - pawfiler-frontend
  - pawfiler-admin-frontend
  - pawfiler-quiz-media
  - pawfiler-reports ← 리포트 HTML 저장 (1일 lifecycle 자동 삭제)

## ❌ 미생성 (비용 발생 - 필요시만 생성)

### 비용 발생 리소스

- NAT Gateway ($32/월) - Private 서브넷 인터넷 필요시
- RDS PostgreSQL ($15/월) - 데이터베이스 필요시
- EKS Cluster ($133/월) - Kubernetes 필요시
- Bastion EC2 ($8/월) - SSH 접속 필요시

## ✅ Lambda 기반 서비스 (사용량 기반 과금)

- Lambda Function: `pawfiler-report` (리포트 생성, 요청시만 실행)
- SQS Queue: `pawfiler-report-jobs` + DLQ
- → 월 100건 기준 $0.01 미만
- 자세한 내용: [REPORT_LAMBDA_MIGRATION.md](../../docs/REPORT_LAMBDA_MIGRATION.md)

## 🚀 다음 단계

### EKS 시작 (필요시)

```bash
cd terraform
./start-eks.sh
```

### RDS 생성 (필요시)

```bash
terraform apply -target=aws_db_subnet_group.main \
  -target=aws_security_group.rds \
  -target=aws_db_instance.main
```

### NAT Gateway 생성 (Private 서브넷에서 인터넷 필요시)

```bash
terraform apply -target=aws_eip.nat \
  -target=aws_nat_gateway.main \
  -target=aws_route_table.private \
  -target=aws_route_table_association.private
```

## 💰 현재 월 예상 비용

- VPC, Subnets, IGW: **$0**
- IAM Roles: **$0**
- ECR (이미지 없음): **~$0**
- S3 (파일 없음): **~$0**

**총 월 비용: ~$0** 🎉
