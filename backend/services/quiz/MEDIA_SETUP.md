# Quiz Media Setup Guide

퀴즈 문제에 사용할 이미지와 비디오를 S3에 업로드하고 CloudFront로 서빙하는 가이드입니다.

## 1. 인프라 생성

### Terraform으로 S3 + CloudFront 생성
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

생성되는 리소스:
- S3 버킷: `pawfiler-quiz-media`
- CloudFront 배포
- Origin Access Identity (OAI)
- 버킷 정책

## 2. 샘플 미디어 준비

### 디렉토리 구조 생성
```bash
cd backend/services/quiz
./upload-media.sh
```

처음 실행하면 디렉토리 구조가 자동 생성됩니다:
```
sample-media/
├── images/
│   ├── deepfake/
│   ├── real/
│   └── comparison/
└── videos/
    ├── deepfake/
    ├── real/
    └── comparison/
```

### 파일 추가

**이미지 파일 (JPG/PNG):**
```bash
# 딥페이크 이미지
sample-media/images/deepfake/
  - deepfake_easy_001.jpg
  - deepfake_medium_001.jpg
  - deepfake_hard_001.jpg

# 실제 이미지
sample-media/images/real/
  - real_easy_001.jpg
  - real_medium_001.jpg

# 비교 문제용
sample-media/images/comparison/
  - compare_left_001.jpg
  - compare_right_001.jpg
```

**비디오 파일 (MP4):**
```bash
# 딥페이크 영상
sample-media/videos/deepfake/
  - deepfake_easy_001.mp4
  - deepfake_medium_001.mp4

# 실제 영상
sample-media/videos/real/
  - real_easy_001.mp4
```

## 3. S3 업로드

### 자동 업로드 (권장)
```bash
cd backend/services/quiz
./upload-media.sh
```

### 수동 업로드
```bash
# 이미지 업로드
aws s3 sync sample-media/images/ s3://pawfiler-quiz-media/images/ \
  --content-type "image/jpeg" \
  --cache-control "max-age=31536000"

# 비디오 업로드
aws s3 sync sample-media/videos/ s3://pawfiler-quiz-media/videos/ \
  --content-type "video/mp4" \
  --cache-control "max-age=31536000"
```

## 4. CloudFront URL 확인

### Terraform Output으로 확인
```bash
cd terraform
terraform output quiz_media_cloudfront_url
```

출력 예시:
```
https://d1234567890.cloudfront.net
```

### AWS CLI로 확인
```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='pawfiler quiz media CDN'].DomainName | [0]" \
  --output text
```

## 5. 데이터베이스 마이그레이션 업데이트

CloudFront URL을 확인한 후 마이그레이션 파일을 업데이트합니다:

```sql
-- migrations/002_insert_sample_data.sql

-- CloudFront URL로 변경
INSERT INTO quiz.questions (id, type, media_type, media_url, ...)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440001',
        'MULTIPLE_CHOICE',
        'IMAGE',
        'https://d1234567890.cloudfront.net/images/deepfake/deepfake_easy_001.jpg',
        ...
    );
```

## 6. 마이그레이션 실행

```bash
# 로컬 테스트
docker-compose up -d postgres
psql -h localhost -U pawfiler -d pawfiler_db -f migrations/002_insert_sample_data.sql

# 프로덕션 (Bastion 통해)
ssh -i ~/.ssh/silver-guardian-key.pem ec2-user@<bastion-ip>
psql -h <rds-endpoint> -U pawfiler -d pawfiler_db -f 002_insert_sample_data.sql
```

## 7. 테스트

### API 테스트
```bash
# 랜덤 문제 가져오기
curl -X POST http://localhost:3001/api/quiz/random \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user"}'
```

### 브라우저에서 확인
```
https://d1234567890.cloudfront.net/images/deepfake/deepfake_easy_001.jpg
```

## 파일 명명 규칙

### 이미지
- `{type}_{difficulty}_{number}.jpg`
- 예: `deepfake_easy_001.jpg`, `real_medium_002.jpg`

### 비디오
- `{type}_{difficulty}_{number}.mp4`
- 예: `deepfake_hard_001.mp4`, `real_easy_003.mp4`

### 비교 문제
- `compare_left_{number}.jpg` / `compare_right_{number}.jpg`
- `compare_left_{number}.mp4` / `compare_right_{number}.mp4`

## 비용 예상

### S3 스토리지
- 이미지 100개 (각 500KB): $0.0023/월
- 비디오 20개 (각 10MB): $0.0046/월

### CloudFront
- 트래픽 10GB/월: $0.85/월
- 요청 100만건/월: $1.00/월

**총 예상 비용: ~$2/월**

## 트러블슈팅

### 1. 버킷이 없다는 에러
```bash
# Terraform 적용 확인
cd terraform
terraform apply
```

### 2. CloudFront에서 403 에러
- OAI 설정 확인
- 버킷 정책 확인
- 파일이 실제로 업로드되었는지 확인

```bash
aws s3 ls s3://pawfiler-quiz-media/images/ --recursive
```

### 3. 이미지가 안 보임
- CloudFront 캐시 무효화
```bash
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> \
  --paths "/*"
```

## 다음 단계

1. ✅ S3 + CloudFront 인프라 생성
2. ✅ 샘플 미디어 업로드
3. ✅ 마이그레이션 파일 업데이트
4. ⬜ 실제 딥페이크 데이터셋 수집
5. ⬜ 프로덕션 배포
