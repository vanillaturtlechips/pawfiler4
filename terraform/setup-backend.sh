#!/bin/bash
# Terraform Backend 설정 스크립트
# 팀원들과 Terraform 상태를 공유하기 위한 S3 버킷 및 DynamoDB 테이블 생성

set -e

BUCKET_NAME="pawfiler-terraform-state"
TABLE_NAME="pawfiler-terraform-locks"
REGION="ap-northeast-2"

echo "🚀 Terraform Backend 설정 시작..."

# S3 버킷 생성
echo "📦 S3 버킷 생성 중: $BUCKET_NAME"
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION \
  2>/dev/null || echo "버킷이 이미 존재합니다."

# 버전 관리 활성화
echo "🔄 S3 버킷 버전 관리 활성화 중..."
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# 암호화 활성화
echo "🔐 S3 버킷 암호화 활성화 중..."
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# 퍼블릭 액세스 차단
echo "🚫 S3 버킷 퍼블릭 액세스 차단 중..."
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# DynamoDB 테이블 생성
echo "🗄️  DynamoDB 테이블 생성 중: $TABLE_NAME"
aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION \
  2>/dev/null || echo "테이블이 이미 존재합니다."

echo ""
echo "✅ Terraform Backend 설정 완료!"
echo ""
echo "다음 단계:"
echo "1. backend.tf.example 파일의 주석을 해제하고 backend.tf로 이름 변경"
echo "2. terraform init -migrate-state 실행"
echo ""
