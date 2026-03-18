# Report Service 팀 공유 문서

## 개요

사용자의 퀴즈 풀이 데이터를 분석해 개인 맞춤형 HTML 리포트를 생성하는 서비스입니다.
**EKS Pod → Lambda + SQS + S3 EDA 방식으로 전환 완료.**

---

## 현재 아키텍처 (Lambda EDA)

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
Frontend → window.open(presigned_url)

※ SQS 큐(pawfiler-report-jobs)는 향후 비동기 처리 확장용으로 준비됨
```

### Lambda 핸들러 분기

`main.lambda_handler` 단일 진입점에서 이벤트 소스에 따라 자동 분기:

- `Records[].eventSource == "aws:sqs"` → `sqs_handler` (SQS 트리거)
- 그 외 → `mangum` (FastAPI, Function URL / API Gateway)

---

## 이전 아키텍처 (EKS Pod, 제거됨)

```
Frontend → ALB → EKS report-service Pod → /tmp → FileResponse
```

ArgoCD `apps/services/report/` 디렉토리 삭제로 EKS Pod 자동 제거됨.

---

## AWS 리소스

| 리소스              | 이름                       | 설명                               |
| ------------------- | -------------------------- | ---------------------------------- |
| Lambda              | `pawfiler-report`          | 리포트 생성 함수 (1024MB, 300s)    |
| Lambda Function URL | -                          | CORS 허용, 프론트엔드 직접 호출    |
| ECR                 | `pawfiler/report-lambda`   | Lambda 컨테이너 이미지             |
| S3                  | `pawfiler-reports`         | HTML 저장, 1일 lifecycle 자동 삭제 |
| SQS                 | `pawfiler-report-jobs`     | 비동기 큐 (향후 확장용)            |
| SQS DLQ             | `pawfiler-report-jobs-dlq` | 2회 실패 시 이동                   |

---

## API 엔드포인트

| Method | Path                  | 설명                                                        |
| ------ | --------------------- | ----------------------------------------------------------- |
| POST   | `/generate`           | 리포트 생성 → S3 presigned URL 반환                         |
| GET    | `/download/{user_id}` | S3 presigned URL로 리다이렉트 (로컬 개발 시 /tmp 파일 반환) |
| GET    | `/health`             | 헬스체크                                                    |

### POST /generate 요청

```json
{
  "user_id": "user-123",
  "days": 30,
  "nickname": "탐정홍길동",
  "avatar_emoji": "🐾",
  "email": "user@example.com",
  "subscription_type": "free"
}
```

`days: null` → 전체 기간 집계

### 응답

```json
{
  "report_url": "https://pawfiler-reports.s3.ap-northeast-2.amazonaws.com/reports/user-123.html?X-Amz-..."
}
```

S3 버킷 미설정 시(로컬 개발) `/download/{user_id}` 경로 반환.

---

## 환경변수

| 변수               | 설명               | 예시                                                       |
| ------------------ | ------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`     | RDS Proxy 연결 URL | `postgresql://pawfiler:pw@proxy-endpoint:5432/pawfiler_db` |
| `REPORT_S3_BUCKET` | 리포트 저장 버킷명 | `pawfiler-reports`                                         |
| `REPORT_S3_PREFIX` | S3 키 prefix       | `reports`                                                  |

---

## 배포 흐름

```
코드 변경 (main 브랜치 push)
    │
    ▼
GitHub Actions
    │  docker build → ECR push (pawfiler/report-lambda:latest)
    ▼
aws lambda update-function-code \
  --function-name pawfiler-report \
  --image-uri <ECR_URI>:latest
```

Terraform으로 Lambda 생성 후 이미지 URI는 CI/CD에서 관리 (`lifecycle { ignore_changes = [image_uri] }`).

---

## 로컬 개발

```bash
# S3 없이 로컬 /tmp 저장 모드 (REPORT_S3_BUCKET 미설정)
cd pawfiler4/backend/services/report
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8090 --reload

# 테스트
curl -X POST http://localhost:8090/generate \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user", "days": 30}'
```

---

## 운영 가이드

### Lambda 로그 확인

```bash
aws logs tail /aws/lambda/pawfiler-report --follow
```

### Function URL 확인

```bash
terraform output report_function_url
```

### 이미지 업데이트

```bash
ECR_URL=$(terraform output -raw report_ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin $ECR_URL

docker build -t report-lambda ./backend/services/report
docker tag report-lambda:latest ${ECR_URL}:latest
docker push ${ECR_URL}:latest

aws lambda update-function-code \
  --function-name pawfiler-report \
  --image-uri ${ECR_URL}:latest
```

### 장애 대응

```bash
# Lambda 상태 확인
aws lambda get-function --function-name pawfiler-report

# 최근 에러 로그
aws logs filter-log-events \
  --log-group-name /aws/lambda/pawfiler-report \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s000)

# SQS DLQ 메시지 확인 (실패한 요청)
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name pawfiler-report-jobs-dlq --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages
```

---

## 전환 상세 기록

[REPORT_LAMBDA_MIGRATION.md](../../docs/REPORT_LAMBDA_MIGRATION.md) 참고
