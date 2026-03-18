# Report Service → Lambda EDA 전환 가이드

## 배경

리포트 생성 서비스는 사용량이 적어 EKS Pod를 상시 유지하는 것이 비효율적이었음.
Pod 상시 유지 비용(~$15~20/월) 대비 Lambda + SQS + S3 구조로 전환 시 거의 무료 수준으로 운영 가능.

### 기존 아키텍처 (EKS Pod)

```
Frontend
    │
    ▼
POST /generate  (ALB → EKS report-service Pod)
    │  DB 쿼리 + 차트 생성 + HTML 빌드 (동기, 타임아웃 위험)
    ▼
GET /download/{user_id}
    │  /tmp 로컬 파일 반환 (Pod 재시작 시 유실)
    ▼
Frontend
```

### 변경 아키텍처 (Lambda EDA)

```
Frontend
    │
    ▼
POST /generate  (Lambda Function URL)
    │  DB 쿼리 + 차트 생성 + HTML 빌드
    ▼
S3 (pawfiler-reports/{user_id}.html)
    │  presigned URL 반환 (유효기간 1시간)
    ▼
Frontend (window.open으로 직접 다운로드)

※ SQS 큐(pawfiler-report-jobs)는 향후 비동기 처리 확장용으로 준비됨
```

---

## 변경된 파일 목록

### 백엔드

| 파일                                       | 변경 내용                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `backend/services/report/main.py`          | `mangum`, `boto3` 추가. S3 업로드 + presigned URL 반환. `lambda_handler` (SQS/HTTP 자동 분기 통합 핸들러) 추가 |
| `backend/services/report/Dockerfile`       | Lambda 컨테이너 이미지 베이스(`public.ecr.aws/lambda/python:3.11`)로 교체                                      |
| `backend/services/report/requirements.txt` | `mangum==0.17.0`, `boto3==1.34.0` 추가                                                                         |

### 프론트엔드

| 파일                                 | 변경 내용                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/lib/api.ts`            | `generateReport` 시그니처 `days?: number \| null`로 변경. `days: null`이면 전체 기간 처리                                            |
| `frontend/src/pages/ProfilePage.tsx` | `reportDays` state 추가. Select 컴포넌트로 기간 선택(7일/30일/90일/전체). `report_url`이 `http`로 시작하면 presigned URL로 직접 열기 |

### Terraform

| 파일                                           | 변경 내용                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `terraform/modules/lambda_report/main.tf`      | S3, ECR, SQS, IAM, Lambda, Function URL, Security Group 신규 생성                                   |
| `terraform/modules/lambda_report/variables.tf` | 모듈 변수 정의                                                                                      |
| `terraform/modules/lambda_report/outputs.tf`   | Function URL, ECR URL, 버킷명 등 output                                                             |
| `terraform/main.tf`                            | `module "lambda_report"` 호출 추가                                                                  |
| `terraform/variables.tf`                       | 기존 변수 유지 (report_database_url 제거 — main.tf에서 자동 조합)                                   |
| `terraform/outputs.tf`                         | `report_function_url`, `report_ecr_repository_url`, `report_bucket_name`, `rds_proxy_endpoint` 추가 |
| `terraform/modules/rds/outputs.tf`             | `rds_proxy_endpoint`, `rds_security_group_id` 추가                                                  |

### ArgoCD

| 파일                             | 변경 내용                                                             |
| -------------------------------- | --------------------------------------------------------------------- |
| `apps/services/report/` 디렉토리 | **삭제** — Lambda 전환으로 EKS Pod 불필요. ArgoCD가 감지 후 자동 제거 |

---

## 신규 AWS 리소스

| 리소스              | 이름                          | 설명                                      |
| ------------------- | ----------------------------- | ----------------------------------------- |
| S3 Bucket           | `pawfiler-reports`            | 리포트 HTML 저장. 1일 lifecycle 자동 삭제 |
| ECR Repository      | `pawfiler/report-lambda`      | Lambda 컨테이너 이미지 저장               |
| SQS Queue           | `pawfiler-report-jobs`        | 비동기 처리 큐 (향후 확장용)              |
| SQS DLQ             | `pawfiler-report-jobs-dlq`    | 2회 실패 시 DLQ로 이동                    |
| Lambda Function     | `pawfiler-report`             | 리포트 생성 함수 (1024MB, 300s timeout)   |
| Lambda Function URL | -                             | CORS 허용, 프론트엔드 직접 호출           |
| Security Group      | `pawfiler-lambda-report-sg`   | Lambda VPC 전용 SG                        |
| IAM Role            | `pawfiler-report-lambda-role` | Lambda 실행 역할 (VPC + S3 + SQS)         |

---

## 트러블슈팅 기록

### 1. Lambda VPC 설정 누락 → RDS 접근 불가

**문제**: 초기 코드에 `vpc_config`가 없어 Lambda가 VPC 밖에서 실행됨. RDS는 private subnet에 있어 접근 불가.

**해결**:

```hcl
vpc_config {
  subnet_ids         = var.private_subnet_ids
  security_group_ids = [aws_security_group.lambda_report.id]
}
```

- Lambda 전용 Security Group 생성
- RDS Security Group에 Lambda SG로부터 5432 인바운드 허용 규칙 추가
- IAM 역할을 `AWSLambdaBasicExecutionRole` → `AWSLambdaVPCAccessExecutionRole`로 교체 (VPC ENI 생성 권한)

### 2. Lambda 첫 apply 시 ECR 이미지 없어 실패

**문제**: `aws_lambda_function`은 이미지가 ECR에 존재해야 생성 가능.

**해결**: apply를 두 단계로 분리

```bash
# 1단계: ECR 리포지토리만 먼저 생성
terraform apply -target=module.lambda_report.aws_ecr_repository.report_lambda

# 2단계: 이미지 빌드 & push
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com

docker build -t pawfiler/report-lambda ./backend/services/report
docker tag pawfiler/report-lambda:latest <ECR_URL>:latest
docker push <ECR_URL>:latest

# 3단계: 나머지 Lambda 리소스 생성
terraform apply -target=module.lambda_report
```

### 3. SQS 트리거와 Function URL 핸들러 충돌

**문제**: SQS 이벤트와 HTTP 이벤트가 같은 Lambda를 공유할 때 `image_config.command`를 하나로 통일해야 함.

**해결**: `main.py`에 통합 핸들러 작성

```python
def lambda_handler(event, context):
    # SQS 트리거: Records 키 존재 여부로 분기
    if "Records" in event and event["Records"][0].get("eventSource") == "aws:sqs":
        return sqs_handler(event, context)
    return _mangum_handler(event, context)  # Function URL / API Gateway
```

### 4. git stash pop 후 충돌 파일 처리

**문제**: 팀원 대규모 push 후 stash pop 시 4개 파일 충돌.

**해결**: 원격 버전(theirs) 채택 후 우리 변경사항 재적용

```bash
git checkout --theirs frontend/src/pages/ProfilePage.tsx \
  frontend/src/lib/api.ts \
  frontend/src/components/quiz/RegionSelectQuestion.tsx \
  .github/workflows/ci-cd.yml
git add <위 파일들>
# 이후 ProfilePage.tsx에 Select 컴포넌트, reportDays state 수동 재적용
```

### 5. RDS 직접 연결 대신 RDS Proxy 사용

**문제**: Lambda는 요청마다 새 프로세스가 뜨므로 DB 커넥션이 폭발적으로 증가할 수 있음.

**해결**: 이미 구성된 RDS Proxy endpoint를 `DATABASE_URL`로 사용

```hcl
database_url = "postgresql://${var.database_username}:${var.database_password}@${module.rds.rds_proxy_endpoint}:5432/..."
```

---

## apply 순서 (중요)

```bash
cd pawfiler4/terraform

# 0. 새 모듈 인식
terraform init

# 1. plan으로 기존 인프라 영향 없는지 확인
terraform plan -target=module.lambda_report

# 2. ECR 리포지토리 먼저 생성
terraform apply -target=module.lambda_report.aws_ecr_repository.report_lambda

# 3. 이미지 빌드 & ECR push
ECR_URL=$(terraform output -raw report_ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin $ECR_URL

docker build -t report-lambda ./backend/services/report
docker tag report-lambda:latest ${ECR_URL}:latest
docker push ${ECR_URL}:latest

# 4. 나머지 Lambda 리소스 생성
terraform apply -target=module.lambda_report

# 5. Function URL 확인
terraform output report_function_url
```

---

## 테스트

### Function URL로 직접 테스트

```bash
FUNCTION_URL=$(terraform output -raw report_function_url)

curl -X POST ${FUNCTION_URL}generate \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user-123","days":30,"nickname":"테스트탐정"}'
```

응답 예시:

```json
{
  "report_url": "https://pawfiler-reports.s3.ap-northeast-2.amazonaws.com/reports/test-user-123.html?X-Amz-..."
}
```

### 프론트엔드 연동

`frontend/.env.local` 또는 프로덕션 환경변수:

```
VITE_REPORT_BASE_URL=https://<function-url>.lambda-url.ap-northeast-2.on.aws
```

---

## 비용 비교

| 방식              | 월 비용 (요청 100건 기준)  |
| ----------------- | -------------------------- |
| EKS Pod 상시 유지 | ~$15~20 (노드 리소스 점유) |
| Lambda + SQS + S3 | ~$0.01 미만                |

S3 lifecycle 1일 설정으로 스토리지 비용도 최소화.
presigned URL 유효기간 1시간 — S3 lifecycle 최소 단위가 1일이므로 1일로 설정.
