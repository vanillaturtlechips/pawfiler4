# Quiz Sample Media

이 디렉토리는 퀴즈 문제에 사용될 샘플 미디어 파일을 저장합니다.

## 디렉토리 구조

```
sample-media/
├── images/
│   ├── deepfake/          # 딥페이크 이미지
│   ├── real/              # 실제 이미지
│   └── comparison/        # 비교 문제용 이미지
└── videos/
    ├── deepfake/          # 딥페이크 영상
    ├── real/              # 실제 영상
    └── comparison/        # 비교 문제용 영상
```

## S3 업로드 방법

### 1. Terraform으로 S3 버킷 생성
```bash
cd terraform
terraform apply
```

### 2. AWS CLI로 파일 업로드
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

### 3. 업로드 스크립트 사용
```bash
cd backend/services/quiz
./upload-media.sh
```

## 파일 명명 규칙

- 이미지: `{type}_{difficulty}_{number}.jpg`
  - 예: `deepfake_easy_001.jpg`, `real_medium_002.jpg`
- 비디오: `{type}_{difficulty}_{number}.mp4`
  - 예: `deepfake_hard_001.mp4`, `real_easy_003.mp4`

## CloudFront URL 형식

업로드 후 URL:
```
https://d1234567890.cloudfront.net/images/deepfake/deepfake_easy_001.jpg
https://d1234567890.cloudfront.net/videos/real/real_medium_002.mp4
```

## 라이선스

샘플 미디어는 교육 목적으로만 사용됩니다.
실제 프로덕션에서는 적절한 라이선스를 가진 미디어를 사용하세요.
