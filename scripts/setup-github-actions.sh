#!/bin/bash
set -e

echo "🔐 GitHub Actions OIDC 설정"
echo "============================"

AWS_ACCOUNT_ID="009946608368"
GITHUB_REPO="vanillaturtlechips/pawfiler4"

# 1. OIDC Provider 생성 (이미 있으면 스킵)
echo ""
echo "Step 1: OIDC Provider 생성"
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "OIDC Provider 이미 존재"

# 2. IAM Role 생성
echo ""
echo "Step 2: IAM Role 생성"
aws iam create-role \
  --role-name GitHubActionsECRRole \
  --assume-role-policy-document file://.github/github-actions-trust-policy.json \
  2>/dev/null || echo "Role 이미 존재"

# 3. ECR 권한 정책 연결
echo ""
echo "Step 3: ECR 권한 부여"
aws iam attach-role-policy \
  --role-name GitHubActionsECRRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

# 4. EKS 읽기 권한 (선택사항)
aws iam attach-role-policy \
  --role-name GitHubActionsECRRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

echo ""
echo "✅ 설정 완료!"
echo ""
echo "GitHub Secrets에 다음 값을 추가하세요:"
echo "AWS_ROLE_ARN: arn:aws:iam::${AWS_ACCOUNT_ID}:role/GitHubActionsECRRole"
echo "ECR_REGISTRY: ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com"
echo "ARGOCD_REPO_TOKEN: (GitHub Personal Access Token)"
