#!/bin/bash
set -e

AWS_REGION="ap-northeast-2"
FRONTEND_BUCKET="pawfiler-frontend"
ADMIN_BUCKET="pawfiler-admin-frontend"

echo "🏗️  프론트엔드 빌드 중..."
cd frontend
npm install
npm run build

echo "📤 S3에 업로드 중 (사용자 프론트엔드)..."
aws s3 sync dist/ s3://${FRONTEND_BUCKET}/ --delete --region ${AWS_REGION}

echo "🔄 CloudFront 캐시 무효화..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --region ${AWS_REGION} --query "DistributionList.Items[?Origins.Items[?DomainName=='${FRONTEND_BUCKET}.s3.${AWS_REGION}.amazonaws.com']].Id" --output text)
if [ -n "$DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*" --region ${AWS_REGION}
fi

cd ..

echo ""
echo "🏗️  관리자 프론트엔드 빌드 중..."
cd admin-frontend
npm install
npm run build

echo "📤 S3에 업로드 중 (관리자 프론트엔드)..."
aws s3 sync dist/ s3://${ADMIN_BUCKET}/ --delete --region ${AWS_REGION}

echo "🔄 CloudFront 캐시 무효화..."
ADMIN_DISTRIBUTION_ID=$(aws cloudfront list-distributions --region ${AWS_REGION} --query "DistributionList.Items[?Origins.Items[?DomainName=='${ADMIN_BUCKET}.s3.${AWS_REGION}.amazonaws.com']].Id" --output text)
if [ -n "$ADMIN_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id ${ADMIN_DISTRIBUTION_ID} --paths "/*" --region ${AWS_REGION}
fi

cd ..

echo ""
echo "✅ 프론트엔드 배포 완료!"
echo "📍 사용자: https://${FRONTEND_BUCKET}.s3-website.${AWS_REGION}.amazonaws.com"
echo "📍 관리자: https://${ADMIN_BUCKET}.s3-website.${AWS_REGION}.amazonaws.com"
