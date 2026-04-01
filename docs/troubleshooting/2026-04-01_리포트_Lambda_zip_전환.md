# 리포트 Lambda — 컨테이너 이미지 → zip 배포 전환

## 배경

기존 report Lambda는 matplotlib/numpy 등 C extension 라이브러리 때문에 컨테이너 이미지 방식으로 배포되었다.
이미지 크기가 ~271MB에 달해 콜드 스타트가 느리고 ECR 관리 부담이 있었다.

## 변경 내용

### 1. matplotlib 제거 → HTML/CSS 차트로 교체

`make_chart()` 함수를 matplotlib PNG 생성에서 순수 HTML/CSS 막대 차트로 교체.

제거된 의존성:

- `matplotlib==3.9.4`
- `numpy==1.26.4`
- Dockerfile의 `gcc`, `gcc-c++`, 한글 폰트 설치

변경 후 `requirements.txt`:

```
psycopg2-binary==2.9.9
fastapi==0.111.0
mangum==0.17.0
boto3==1.34.0
```

### 2. Dockerfile 경량화

```dockerfile
# 변경 전
FROM public.ecr.aws/lambda/python:3.11
RUN yum install -y fontconfig gcc gcc-c++ && yum clean all
RUN curl -L ... NotoSansCJKkr-Regular.otf && fc-cache -fv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["main.lambda_handler"]

# 변경 후
FROM public.ecr.aws/lambda/python:3.11
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["main.lambda_handler"]
```

### 3. Lambda 배포 방식 전환 (Image → Zip)

Terraform `lambda_report/main.tf`:

```hcl
# 변경 전
resource "aws_lambda_function" "report" {
  package_type = "Image"
  image_uri    = local.image_uri
  ...
}

# 변경 후
resource "aws_lambda_function" "report" {
  package_type = "Zip"
  s3_bucket    = var.lambda_s3_bucket
  s3_key       = var.lambda_s3_key
  handler      = "main.lambda_handler"
  runtime      = "python3.11"
  ...
}
```

ECR 리포지토리 리소스 제거 (기존 ECR 이미지는 수동 관리).

### 4. CI/CD 변경

```yaml
# 변경 전: Docker 빌드 → ECR 푸시 → Lambda 이미지 업데이트
# 변경 후: pip install → zip 압축 → S3 업로드 → Lambda zip 업데이트

- name: Build zip package
  run: |
    pip install -r requirements.txt -t ./package --quiet
    cp main.py ./package/
    cd package && zip -r ../report.zip . -q

- name: Upload zip to S3
  run: aws s3 cp report.zip s3://pawfiler-reports/lambda/report.zip

- name: Update Lambda function code
  run: |
    aws lambda update-function-code \
      --function-name pawfiler-report \
      --s3-bucket pawfiler-reports \
      --s3-key lambda/report.zip
```

## 효과

| 항목                 | 변경 전           | 변경 후              |
| -------------------- | ----------------- | -------------------- |
| 이미지/패키지 크기   | ~271MB (컨테이너) | ~20MB (zip)          |
| 빌드 시간            | 5~10분 (Docker)   | 1~2분 (pip+zip)      |
| 콜드 스타트          | 느림              | 빠름                 |
| ECR 필요 여부        | 필요              | 불필요               |
| Dockerfile 필요 여부 | 필요              | 불필요 (참고용 유지) |

## Terraform apply 주의사항

`package_type` 변경은 Lambda 함수 재생성이 필요하다.
기존 함수를 삭제하고 재생성하므로 `terraform apply` 전 확인 필요.

```bash
cd pawfiler4/terraform
terraform plan  # 변경사항 확인
terraform apply
```

apply 후 첫 배포는 CI/CD를 통해 zip을 S3에 올리거나 수동으로 실행:

```powershell
cd pawfiler4/backend/services/report
pip install -r requirements.txt -t ./package
cp main.py ./package/
cd package; zip -r ../report.zip .
aws s3 cp ../report.zip s3://pawfiler-reports/lambda/report.zip
aws lambda update-function-code `
  --function-name pawfiler-report `
  --s3-bucket pawfiler-reports `
  --s3-key lambda/report.zip `
  --region ap-northeast-2
```

## 로컬 테스트

```powershell
$env:HTML_ONLY="1"; python main.py
# PawFiler_리포트_v2.html 생성 → 브라우저로 확인
```
