#!/usr/bin/env bash
# Cognito 마이그레이션 검증 스크립트
# 사용법: DATABASE_URL=... COGNITO_USER_POOL_ID=... ./backend/scripts/verify_migration.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL 환경 변수 필요}"
: "${COGNITO_USER_POOL_ID:?COGNITO_USER_POOL_ID 환경 변수 필요}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"

PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  local expected="$3"
  if [[ "$result" == "$expected" ]]; then
    echo "  ✅ $desc"
    ((PASS++)) || true
  else
    echo "  ❌ $desc (got: $result, expected: $expected)"
    ((FAIL++)) || true
  fi
}

echo "=== 1. DB 스키마 검증 ==="
DB_CMD="psql $DATABASE_URL -t -c"

# auth.users.id 컬럼 타입이 text인지 확인
ID_TYPE=$($DB_CMD "SELECT data_type FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='id'" | tr -d ' ')
check "auth.users.id 타입 = text" "$ID_TYPE" "text"

# password_hash nullable인지 확인
PW_NULLABLE=$($DB_CMD "SELECT is_nullable FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='password_hash'" | tr -d ' ')
check "auth.users.password_hash nullable = YES" "$PW_NULLABLE" "YES"

# subscription_type 컬럼 존재 여부
SUB_TYPE=$($DB_CMD "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='subscription_type'" | tr -d ' ')
check "auth.users.subscription_type 컬럼 존재" "$SUB_TYPE" "1"

echo ""
echo "=== 2. Cognito 동기화 검증 ==="

# auth.users의 ID가 Cognito sub 형식(UUID)인지 확인
NON_UUID=$($DB_CMD "SELECT COUNT(*) FROM auth.users WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'" | tr -d ' ')
check "auth.users 모든 ID가 UUID 형식" "$NON_UUID" "0"

# Cognito 사용자 수 확인
COGNITO_COUNT=$(aws cognito-idp list-users --user-pool-id "$COGNITO_USER_POOL_ID" --region "$AWS_REGION" --query 'length(Users)' --output text 2>/dev/null || echo "N/A")
DB_COUNT=$($DB_CMD "SELECT COUNT(*) FROM auth.users" | tr -d ' ')
echo "  📊 DB 사용자: $DB_COUNT, Cognito 사용자: $COGNITO_COUNT"

echo ""
echo "=== 3. 외래 키 정합성 검증 ==="

# community.posts의 author_id가 auth.users에 없는 것 확인
ORPHAN_POSTS=$($DB_CMD "SELECT COUNT(*) FROM community.posts p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.author_id)" | tr -d ' ')
check "community.posts 고아 author_id 없음" "$ORPHAN_POSTS" "0"

ORPHAN_COMMENTS=$($DB_CMD "SELECT COUNT(*) FROM community.comments c WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.author_id)" | tr -d ' ')
check "community.comments 고아 author_id 없음" "$ORPHAN_COMMENTS" "0"

ORPHAN_QUIZ=$($DB_CMD "SELECT COUNT(*) FROM quiz.user_profiles qp WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = qp.user_id::text)" | tr -d ' ')
check "quiz.user_profiles 고아 user_id 없음" "$ORPHAN_QUIZ" "0"

echo ""
echo "=== 검증 완료 ==="
echo "  통과: $PASS / 실패: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "  ⚠️  실패 항목이 있습니다. 로그를 확인하고 마이그레이션을 재실행하세요."
  exit 1
fi
echo "  🎉 모든 검증 통과!"
