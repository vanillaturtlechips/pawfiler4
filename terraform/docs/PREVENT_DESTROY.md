# ⚠️ 중요: 리소스 삭제 방지 정책

## 🔒 삭제 방지된 리소스 (절대 삭제 금지!)

다음 리소스들은 `prevent_destroy` 라이프사이클 정책으로 보호되어 있습니다.
**실수로 삭제하면 프로젝트 전체가 영향받습니다!**

### 네트워크
- ✅ VPC (`aws_vpc.main`)

### IAM Roles
- ✅ EKS Cluster Role (`aws_iam_role.eks_cluster_role`)
- ✅ EKS Node Group Role (`aws_iam_role.eks_node_group_role`)

### 저장소
- ✅ ECR Repositories (4개)
  - `aws_ecr_repository.quiz_service`
  - `aws_ecr_repository.community_service`
  - `aws_ecr_repository.video_analysis_service`
  - `aws_ecr_repository.admin_service`

- ✅ S3 Buckets (3개)
  - `aws_s3_bucket.frontend`
  - `aws_s3_bucket.admin_frontend`
  - `aws_s3_bucket.quiz_media`

## 🚫 삭제 시도 시 발생하는 일

```bash
terraform destroy
```

실행 시 다음과 같은 에러가 발생합니다:

```
Error: Instance cannot be destroyed

  on networking.tf line 1:
   1: resource "aws_vpc" "main" {

Resource aws_vpc.main has lifecycle.prevent_destroy set, but the plan
calls for this resource to be destroyed. To avoid this error and continue
with the plan, either disable lifecycle.prevent_destroy or reduce the scope
of the plan using the -target flag.
```

## ✅ 안전하게 삭제 가능한 리소스

다음 리소스들은 필요시 자유롭게 생성/삭제 가능합니다:

- EKS Cluster (`aws_eks_cluster.main`)
- EKS Node Group (`aws_eks_node_group.main`)
- RDS Instance (`aws_db_instance.main`)
- NAT Gateway (`aws_nat_gateway.main`)
- Bastion EC2 (`aws_instance.bastion`)

### 예시: EKS만 삭제
```bash
./stop-eks.sh
# 또는
terraform destroy -target=aws_eks_node_group.main -target=aws_eks_cluster.main
```

## 🔓 정말로 삭제해야 하는 경우

보호된 리소스를 삭제해야 한다면:

1. 해당 `.tf` 파일에서 `lifecycle` 블록 제거
2. `terraform apply`로 변경사항 적용
3. 그 후 `terraform destroy` 실행

**주의: 팀원과 반드시 상의 후 진행하세요!**

## 💰 비용 절감 전략

보호된 리소스는 대부분 무료이므로 삭제할 필요가 없습니다:

| 리소스 | 월 비용 | 삭제 필요성 |
|--------|---------|------------|
| VPC, Subnets, IGW | $0 | ❌ 없음 |
| IAM Roles | $0 | ❌ 없음 |
| ECR (이미지 없음) | ~$0 | ❌ 없음 |
| S3 (파일 없음) | ~$0 | ❌ 없음 |

**비용이 발생하는 리소스만 삭제하세요:**
- EKS: $133/월 → `./stop-eks.sh`
- RDS: $15/월 → 필요시만 생성
- NAT Gateway: $32/월 → 필요시만 생성
