# 영상 분석 Lambda 배포 가이드

## 아키텍처

```
[사용자] → [EKS video-analysis gRPC]
              ↓
           [S3 업로드]
              ↓
        [Lambda 호출] (비동기)
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
[VisualLambda]    [AudioLambda]
 (영상 분석)        (음성 분석)
    ↓                   ↓
    └─────────┬─────────┘
              ↓
      [RDS 결과 저장]
              ↓
[EKS] ← 폴링 ← [사용자]
```

---

## 1. 사전 준비

### 1.1 ECR 리포지토리 생성

```bash
cd terraform

# ECR 리포지토리 추가 (이미 있으면 스킵)
aws ecr create-repository \
  --repository-name pawfiler-visual-lambda \
  --region ap-northeast-2

aws ecr create-repository \
  --repository-name pawfiler-audio-lambda \
  --region ap-northeast-2
```

### 1.2 IAM 역할 생성

Lambda 실행 역할 필요:
- S3 읽기 권한
- CloudWatch Logs 쓰기 권한
- RDS 접근 권한 (VPC 내부)

```bash
# terraform/modules/lambda-role/ 생성 (선택)
# 또는 AWS Console에서 수동 생성
```

---

## 2. Lambda 이미지 빌드 & 푸시

### 2.1 자동 배포 (권장)

```bash
cd backend/services/video-analysis

# 배포 스크립트 실행
./lambdas/deploy.sh
```

### 2.2 수동 배포

```bash
cd backend/services/video-analysis

REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ECR 로그인
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

# Visual Lambda 빌드
docker build -f lambdas/Dockerfile.visual -t pawfiler-visual-lambda .
docker tag pawfiler-visual-lambda:latest \
  ${ECR_REGISTRY}/pawfiler-visual-lambda:latest
docker push ${ECR_REGISTRY}/pawfiler-visual-lambda:latest

# Audio Lambda 빌드
docker build -f lambdas/Dockerfile.audio -t pawfiler-audio-lambda .
docker tag pawfiler-audio-lambda:latest \
  ${ECR_REGISTRY}/pawfiler-audio-lambda:latest
docker push ${ECR_REGISTRY}/pawfiler-audio-lambda:latest
```

---

## 3. Lambda 함수 생성

### 3.1 AWS Console에서 생성

#### Visual Lambda

1. **Lambda Console** → Create function
2. **Container image** 선택
3. 설정:
   - Function name: `pawfiler-visual-analysis`
   - Container image URI: `{ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/pawfiler-visual-lambda:latest`
   - Architecture: `x86_64`
4. **Configuration**:
   - Memory: `3008 MB` (3GB)
   - Timeout: `15 min`
   - Ephemeral storage: `2048 MB`
5. **Environment variables**:
   ```
   S3_BUCKET=pawfiler-videos
   MODEL_PATH=/opt/ml/models/mobilevit_v2_best.pth
   ```
6. **Permissions**:
   - Execution role: Lambda 실행 역할 (S3 읽기 권한)

#### Audio Lambda

1. 동일한 방식으로 생성
2. 설정:
   - Function name: `pawfiler-audio-analysis`
   - Container image URI: `{ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/pawfiler-audio-lambda:latest`
   - Memory: `2048 MB` (2GB)
   - Timeout: `10 min`

### 3.2 Terraform으로 생성 (선택)

```hcl
# terraform/modules/lambda/main.tf
resource "aws_lambda_function" "visual_analysis" {
  function_name = "pawfiler-visual-analysis"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = "${var.ecr_registry}/pawfiler-visual-lambda:latest"
  
  memory_size = 3008
  timeout     = 900
  
  environment {
    variables = {
      S3_BUCKET  = var.s3_bucket
      MODEL_PATH = "/opt/ml/models/mobilevit_v2_best.pth"
    }
  }
  
  ephemeral_storage {
    size = 2048
  }
}

resource "aws_lambda_function" "audio_analysis" {
  function_name = "pawfiler-audio-analysis"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = "${var.ecr_registry}/pawfiler-audio-lambda:latest"
  
  memory_size = 2048
  timeout     = 600
  
  environment {
    variables = {
      S3_BUCKET = var.s3_bucket
    }
  }
}
```

---

## 4. EKS 서비스 환경변수 설정

### 4.1 Lambda ARN 확인

```bash
aws lambda get-function --function-name pawfiler-visual-analysis \
  --query 'Configuration.FunctionArn' --output text

aws lambda get-function --function-name pawfiler-audio-analysis \
  --query 'Configuration.FunctionArn' --output text
```

### 4.2 K8s ConfigMap 업데이트

```yaml
# k8s/video-analysis-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: video-analysis-config
  namespace: pawfiler
data:
  VISUAL_LAMBDA_ARN: "arn:aws:lambda:ap-northeast-2:123456789012:function:pawfiler-visual-analysis"
  AUDIO_LAMBDA_ARN: "arn:aws:lambda:ap-northeast-2:123456789012:function:pawfiler-audio-analysis"
  S3_BUCKET: "pawfiler-videos"
```

```bash
kubectl apply -f k8s/video-analysis-configmap.yaml
```

### 4.3 Deployment 업데이트

```yaml
# k8s/video-analysis-deployment.yaml
spec:
  template:
    spec:
      containers:
      - name: video-analysis
        envFrom:
        - configMapRef:
            name: video-analysis-config
```

```bash
kubectl rollout restart deployment/video-analysis -n pawfiler
```

---

## 5. 테스트

### 5.1 Lambda 단독 테스트

```bash
# Visual Lambda 테스트
aws lambda invoke \
  --function-name pawfiler-visual-analysis \
  --payload '{"s3_bucket":"pawfiler-videos","s3_key":"test/sample.mp4","task_id":"test-123"}' \
  response.json

cat response.json
```

### 5.2 전체 플로우 테스트

```bash
# 1. 영상 업로드 (프론트엔드에서)
# 2. gRPC 호출
grpcurl -plaintext -d '{"video_url":"https://example.com/test.mp4","user_id":"test"}' \
  localhost:50054 video_analysis.VideoAnalysisService/AnalyzeVideo

# 3. 결과 조회
grpcurl -plaintext -d '{"task_id":"xxx"}' \
  localhost:50054 video_analysis.VideoAnalysisService/GetUnifiedResult
```

---

## 6. 모니터링

### 6.1 CloudWatch Logs

```bash
# Visual Lambda 로그
aws logs tail /aws/lambda/pawfiler-visual-analysis --follow

# Audio Lambda 로그
aws logs tail /aws/lambda/pawfiler-audio-analysis --follow
```

### 6.2 Lambda 메트릭

- **Duration**: 실행 시간 (목표: <10초)
- **Errors**: 에러 발생 횟수
- **Throttles**: 동시 실행 제한 초과
- **ConcurrentExecutions**: 동시 실행 수

---

## 7. 비용 최적화

### 7.1 Lambda 설정

- **메모리**: 필요한 만큼만 (3GB → 2GB 테스트)
- **Timeout**: 15분 → 실제 필요 시간 + 여유
- **Provisioned Concurrency**: 사용 안 함 (콜드 스타트 허용)

### 7.2 예상 비용

**Visual Lambda (3GB, 10초 실행)**
- 요청당: $0.0000166667 (메모리) + $0.0000002 (요청) = **$0.000017**
- 1000건/월: **$17**

**Audio Lambda (2GB, 5초 실행)**
- 요청당: $0.0000055556 (메모리) + $0.0000002 (요청) = **$0.000006**
- 1000건/월: **$6**

**총 비용**: ~$23/월 (1000건 기준)

### 7.3 무료 티어

- 매월 100만 요청 무료
- 매월 400,000 GB-초 무료
- → 소규모 트래픽은 거의 무료

---

## 8. 트러블슈팅

### 8.1 Lambda Timeout

**증상**: 15분 초과로 실패

**해결**:
```python
# 프레임 샘플링 줄이기
frames = extract_frames(video_path, fps=0.5, max_frames=16)  # 30 → 16
```

### 8.2 메모리 부족

**증상**: "Runtime exited with error: signal: killed"

**해결**:
- Lambda 메모리 3GB → 5GB 증가
- 또는 모델 경량화 (ONNX 최적화)

### 8.3 S3 권한 에러

**증상**: "Access Denied"

**해결**:
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ],
  "Resource": "arn:aws:s3:::pawfiler-videos/*"
}
```

### 8.4 콜드 스타트 느림

**증상**: 첫 요청이 30초 이상

**해결**:
- 이미지 크기 줄이기 (불필요한 패키지 제거)
- 또는 Provisioned Concurrency 사용 (비용 증가)

---

## 9. 다음 단계

### 9.1 RDS 연동

Lambda에서 결과를 RDS에 저장:

```python
# lambdas/visual_lambda.py
import psycopg2

conn = psycopg2.connect(
    host=os.getenv('DB_HOST'),
    database='pawfiler',
    user='admin',
    password=os.getenv('DB_PASSWORD')
)

cursor = conn.cursor()
cursor.execute("""
    INSERT INTO analysis_results (task_id, visual_result, created_at)
    VALUES (%s, %s, NOW())
""", (task_id, json.dumps(result)))
conn.commit()
```

### 9.2 SQS 큐 추가 (선택)

Lambda 직접 호출 대신 SQS 사용:

```
EKS → SQS → Lambda (자동 트리거)
```

장점:
- 재시도 자동화
- 부하 분산
- 실패 처리 (DLQ)

### 9.3 Step Functions (선택)

복잡한 워크플로우:

```
1. Visual Lambda
2. Audio Lambda (병렬)
3. Sync Lambda (조건부)
4. Result Aggregator
```

---

## 요약

1. ✅ ECR에 이미지 푸시
2. ✅ Lambda 함수 2개 생성 (Visual, Audio)
3. ✅ EKS 환경변수 설정 (Lambda ARN)
4. ✅ 테스트 (단독 + 전체)
5. ✅ 모니터링 (CloudWatch)

**예상 비용**: ~$23/월 (1000건 기준)
**처리 시간**: 영상 10초 + 음성 5초 = 15초
