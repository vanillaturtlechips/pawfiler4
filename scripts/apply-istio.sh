#!/usr/bin/env bash
# Terraform output으로 Cognito 값을 읽어 Istio RequestAuthentication에 주입 후 적용
# 사용법: ./scripts/apply-istio.sh
set -euo pipefail

TERRAFORM_DIR="$(dirname "$0")/../terraform"
ISTIO_DIR="$(dirname "$0")/../infrastructure/istio"

echo "[1/3] Terraform output에서 Cognito 값 읽는 중..."
COGNITO_ISSUER=$(terraform -chdir="$TERRAFORM_DIR" output -raw cognito_issuer 2>/dev/null || true)
COGNITO_JWKS_URI=$(terraform -chdir="$TERRAFORM_DIR" output -raw cognito_jwks_uri 2>/dev/null || true)
COGNITO_CLIENT_ID=$(terraform -chdir="$TERRAFORM_DIR" output -raw cognito_spa_client_id 2>/dev/null || true)

if [[ -z "$COGNITO_ISSUER" ]]; then
  echo "ERROR: terraform output cognito_issuer 비어있음. terraform apply 완료 후 재실행 하세요."
  exit 1
fi

echo "  Issuer  : $COGNITO_ISSUER"
echo "  JWKS URI: $COGNITO_JWKS_URI"
echo "  Client  : $COGNITO_CLIENT_ID"

echo "[2/3] RequestAuthentication 값 주입 중..."
TMPFILE=$(mktemp /tmp/istio-request-auth-XXXX.yaml)
sed \
  -e "s|REPLACE_WITH_COGNITO_ISSUER|$COGNITO_ISSUER|g" \
  -e "s|REPLACE_WITH_COGNITO_JWKS_URI|$COGNITO_JWKS_URI|g" \
  -e "s|REPLACE_WITH_COGNITO_CLIENT_ID|$COGNITO_CLIENT_ID|g" \
  "$ISTIO_DIR/request-authentication.yaml" > "$TMPFILE"

echo "[3/3] Istio 리소스 적용 중..."
kubectl apply -f "$TMPFILE"
kubectl apply -f "$ISTIO_DIR/authorization-policy.yaml"
kubectl apply -f "$ISTIO_DIR/peer-authentication.yaml"

rm -f "$TMPFILE"
echo "완료. Istio RequestAuthentication/AuthorizationPolicy/PeerAuthentication 적용됨."
