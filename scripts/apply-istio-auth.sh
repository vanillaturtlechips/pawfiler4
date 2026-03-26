#!/bin/bash
# terraform apply 후 Cognito 값을 request-authentication.yaml에 주입하는 스크립트
# 사용법: ./scripts/apply-istio-auth.sh

set -e

ARGOCD_REPO="/Users/nokzzi/pawfiler4-argocd"
ISTIO_DIR="$ARGOCD_REPO/infrastructure/istio"

echo "Cognito 값 조회 중..."
ISSUER=$(terraform -chdir=/Users/nokzzi/pawfiler4/terraform output -raw cognito_issuer)
JWKS_URI=$(terraform -chdir=/Users/nokzzi/pawfiler4/terraform output -raw cognito_jwks_uri)

echo "issuer: $ISSUER"
echo "jwks_uri: $JWKS_URI"

# request-authentication.yaml 플레이스홀더 치환
sed -i '' \
  -e "s|REPLACE_WITH_COGNITO_ISSUER|$ISSUER|g" \
  -e "s|REPLACE_WITH_COGNITO_JWKS_URI|$JWKS_URI|g" \
  "$ISTIO_DIR/request-authentication.yaml"

# kustomization.yaml에서 주석 해제
sed -i '' \
  -e 's|  # - request-authentication.yaml.*|  - request-authentication.yaml|' \
  -e 's|  # - authorization-policy.yaml.*|  - authorization-policy.yaml|' \
  "$ISTIO_DIR/kustomization.yaml"

echo "완료. request-authentication.yaml 및 kustomization.yaml 업데이트됨."
echo "ArgoCD에 push 후 sync 진행하세요."
