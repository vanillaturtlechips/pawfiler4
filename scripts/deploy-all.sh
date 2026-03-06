#!/bin/bash
# PawFiler AWS 전체 배포 스크립트

set -e

echo "🚀 PawFiler AWS 배포 시작..."

# 환경 변수 설정
AWS_REGION=${AWS_REGION:-ap-northeast-2}
ENVOY_GATEWAY_URL=${ENVOY_GATEWAY_URL:-""}

# Envoy Gateway URL 확인
if [ -z "$ENVOY_GATEWAY_URL" ]; then
  echo "⚠️  ENVOY_GATEWAY_URL 환경 변수가 설정되지 않았습니다."
  echo "   EKS에서 Envoy Gateway의 LoadBalancer URL을 확인하세요:"
  echo "   kubectl get svc envoy-gateway -n default"
  echo ""
  read -p "Envoy Gateway URL을 입력하세요 (예: http://a1234567890.ap-northeast-2.elb.amazonaws.com): " ENVOY_GATEWAY_URL
  
  if [ -z "$ENVOY_GATEWAY_URL" ]; then
    echo "❌ Envoy Gateway URL이 필요합니다. 배포를 중단합니다."
    exit 1
  fi
fi

echo "📍 Envoy Gateway URL: $ENVOY_GATEWAY_URL"

# 1. Docker 이미지 빌드 및 푸시
echo "🐳 Step 1: Docker 이미지 빌드 및 ECR 푸시"
./scripts/build-and-push.sh

# 2. 프론트엔드 S3 배포
echo "🎨 Step 2: 프론트엔드 S3 배포"

# Frontend 빌드 및 S3 업로드
echo "  📦 Building frontend..."
cd frontend
VITE_API_BASE_URL=$ENVOY_GATEWAY_URL npm run build
aws s3 sync dist/ s3://pawfiler-frontend --delete --region ${AWS_REGION}
cd ..

# Admin Frontend 빌드 및 S3 업로드
echo "  📦 Building admin-frontend..."
cd admin-frontend
VITE_API_BASE_URL=$ENVOY_GATEWAY_URL npm run build
aws s3 sync dist/ s3://pawfiler-admin-frontend --delete --region ${AWS_REGION}
cd ..

# 3. CloudFront 캐시 무효화
echo "🔄 Step 3: CloudFront 캐시 무효화"
FRONTEND_DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[?DomainName=='pawfiler-frontend.s3.ap-northeast-2.amazonaws.com']].Id" --output text --region ${AWS_REGION})
if [ -n "$FRONTEND_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id ${FRONTEND_DISTRIBUTION_ID} --paths "/*" --region ${AWS_REGION}
  echo "  ✅ Frontend CloudFront 캐시 무효화 완료"
else
  echo "  ⚠️  Frontend CloudFront distribution을 찾을 수 없습니다"
fi

echo ""
echo "✅ 배포 완료!"
echo ""
echo "📊 배포된 리소스:"
echo "  - Backend Services: ECR에 푸시됨"
echo "  - Frontend: s3://pawfiler-frontend"
echo "  - Admin Frontend: s3://pawfiler-admin-frontend"
echo "  - API Gateway: $ENVOY_GATEWAY_URL"
echo ""
echo "🌐 접속 URL:"
CLOUDFRONT_URL=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[?DomainName=='pawfiler-frontend.s3.ap-northeast-2.amazonaws.com']].DomainName" --output text --region ${AWS_REGION})
if [ -n "$CLOUDFRONT_URL" ]; then
  echo "  - Frontend: https://$CLOUDFRONT_URL"
else
  echo "  - Frontend: http://pawfiler-frontend.s3-website.ap-northeast-2.amazonaws.com"
fi
echo "  - Admin: http://pawfiler-admin-frontend.s3-website.ap-northeast-2.amazonaws.com"
echo ""
echo "⚠️  Note: Kubernetes 매니페스트는 ArgoCD 레포지토리에서 관리됩니다"
