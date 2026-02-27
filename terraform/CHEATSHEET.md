# Terraform Quick Reference

## 자주 사용하는 명령어

```bash
# 초기화 (최초 1회 또는 provider 변경 시)
terraform init

# 계획 확인 (변경 사항 미리보기)
terraform plan

# 계획을 파일로 저장
terraform plan -out=tfplan

# 인프라 적용
terraform apply

# 저장된 계획 적용
terraform apply tfplan

# 특정 리소스만 적용
terraform apply -target=aws_eks_cluster.main

# 출력 값 확인
terraform output

# 특정 출력 값만 보기
terraform output -raw rds_instance_endpoint

# 상태 확인
terraform show

# 리소스 목록
terraform state list

# 특정 리소스 상태 확인
terraform state show aws_eks_cluster.main

# 인프라 삭제
terraform destroy

# 특정 리소스만 삭제
terraform destroy -target=aws_instance.bastion

# 포맷 정리
terraform fmt

# 문법 검증
terraform validate

# 상태 새로고침
terraform refresh
```

## 환경 변수로 AWS 인증

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="ap-northeast-2"
```

## 출력 값 활용

```bash
# RDS 연결 문자열
export DB_HOST=$(terraform output -raw rds_instance_address)
export DB_PORT=$(terraform output -raw rds_instance_port)
export DATABASE_URL="postgresql://pawfiler:PASSWORD@${DB_HOST}:${DB_PORT}/pawfiler_db"

# EKS 클러스터 연결
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name $(terraform output -raw eks_cluster_name)

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $(terraform output -json ecr_repository_urls | jq -r '.quiz_service' | cut -d'/' -f1)
```

## 비용 확인

```bash
# Infracost 설치 (비용 예측 도구)
brew install infracost  # macOS
# 또는
curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh

# 비용 예측
infracost breakdown --path .
```

## 트러블슈팅

```bash
# 상태 파일 잠금 해제 (강제)
terraform force-unlock <LOCK_ID>

# 상태 파일 백업
cp terraform.tfstate terraform.tfstate.backup

# 특정 리소스를 상태에서 제거 (실제 리소스는 유지)
terraform state rm aws_instance.bastion

# 기존 리소스를 Terraform 상태로 가져오기
terraform import aws_instance.bastion i-1234567890abcdef0
```
