#!/bin/bash

# Quiz Media Upload Script
# Uploads sample media files to S3 bucket

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUCKET_NAME="pawfiler-quiz-media"
REGION="ap-northeast-2"
MEDIA_DIR="sample-media"

echo -e "${GREEN}=== Quiz Media Upload Script ===${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if bucket exists
echo -e "${YELLOW}Checking if S3 bucket exists...${NC}"
if ! aws s3 ls "s3://${BUCKET_NAME}" --region ${REGION} 2>&1 > /dev/null; then
    echo -e "${RED}Error: Bucket ${BUCKET_NAME} does not exist${NC}"
    echo "Run 'terraform apply' first to create the bucket"
    exit 1
fi

echo -e "${GREEN}✓ Bucket exists${NC}"
echo ""

# Check if media directory exists
if [ ! -d "${MEDIA_DIR}" ]; then
    echo -e "${YELLOW}Creating media directory structure...${NC}"
    mkdir -p ${MEDIA_DIR}/images/{deepfake,real,comparison}
    mkdir -p ${MEDIA_DIR}/videos/{deepfake,real,comparison}
    echo -e "${GREEN}✓ Directory structure created${NC}"
    echo ""
    echo -e "${YELLOW}Please add your media files to:${NC}"
    echo "  - ${MEDIA_DIR}/images/"
    echo "  - ${MEDIA_DIR}/videos/"
    echo ""
    exit 0
fi

# Count files
IMAGE_COUNT=$(find ${MEDIA_DIR}/images -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) 2>/dev/null | wc -l)
VIDEO_COUNT=$(find ${MEDIA_DIR}/videos -type f \( -name "*.mp4" -o -name "*.webm" \) 2>/dev/null | wc -l)

echo -e "${YELLOW}Found:${NC}"
echo "  - Images: ${IMAGE_COUNT}"
echo "  - Videos: ${VIDEO_COUNT}"
echo ""

if [ ${IMAGE_COUNT} -eq 0 ] && [ ${VIDEO_COUNT} -eq 0 ]; then
    echo -e "${YELLOW}No media files found. Please add files to ${MEDIA_DIR}/${NC}"
    exit 0
fi

# Upload images
if [ ${IMAGE_COUNT} -gt 0 ]; then
    echo -e "${YELLOW}Uploading images...${NC}"
    aws s3 sync ${MEDIA_DIR}/images/ s3://${BUCKET_NAME}/images/ \
        --region ${REGION} \
        --exclude "*" \
        --include "*.jpg" \
        --include "*.jpeg" \
        --include "*.png" \
        --content-type "image/jpeg" \
        --cache-control "max-age=31536000" \
        --metadata-directive REPLACE
    echo -e "${GREEN}✓ Images uploaded${NC}"
fi

# Upload videos
if [ ${VIDEO_COUNT} -gt 0 ]; then
    echo -e "${YELLOW}Uploading videos...${NC}"
    aws s3 sync ${MEDIA_DIR}/videos/ s3://${BUCKET_NAME}/videos/ \
        --region ${REGION} \
        --exclude "*" \
        --include "*.mp4" \
        --include "*.webm" \
        --content-type "video/mp4" \
        --cache-control "max-age=31536000" \
        --metadata-directive REPLACE
    echo -e "${GREEN}✓ Videos uploaded${NC}"
fi

echo ""
echo -e "${GREEN}=== Upload Complete ===${NC}"
echo ""

# Get CloudFront domain
echo -e "${YELLOW}Getting CloudFront domain...${NC}"
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='pawfiler quiz media CDN'].DomainName | [0]" \
    --output text 2>/dev/null || echo "")

if [ -n "${CLOUDFRONT_DOMAIN}" ] && [ "${CLOUDFRONT_DOMAIN}" != "None" ]; then
    echo -e "${GREEN}CloudFront URL: https://${CLOUDFRONT_DOMAIN}${NC}"
    echo ""
    echo "Example URLs:"
    echo "  - https://${CLOUDFRONT_DOMAIN}/images/deepfake/deepfake_easy_001.jpg"
    echo "  - https://${CLOUDFRONT_DOMAIN}/videos/real/real_medium_002.mp4"
else
    echo -e "${YELLOW}CloudFront distribution not found. Run 'terraform apply' to create it.${NC}"
    echo ""
    echo "Direct S3 URLs (not recommended for production):"
    echo "  - https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/images/deepfake/deepfake_easy_001.jpg"
fi

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Update migration file with CloudFront URLs"
echo "2. Run database migration to update question URLs"
echo ""
