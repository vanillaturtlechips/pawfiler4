"""
기존 auth.users → Cognito 마이그레이션 스크립트

실행 전 환경 변수 설정:
  export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
  export COGNITO_USER_POOL_ID="ap-northeast-2_XXXXXXX"
  export AWS_REGION="ap-northeast-2"

실행:
  python backend/scripts/migrate_users_to_cognito.py [--dry-run]
"""

import os
import sys
import uuid
import argparse
import logging
import boto3
import psycopg2
import psycopg2.extras
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")

cognito = boto3.client("cognito-idp", region_name=AWS_REGION)


def get_existing_users(conn):
    """auth.users 테이블에서 기존 사용자 목록 조회"""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, email, nickname FROM auth.users ORDER BY created_at")
        return cur.fetchall()


def get_cognito_sub(email: str) -> str | None:
    """Cognito에서 이메일로 사용자 조회 → sub 반환"""
    try:
        resp = cognito.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
        )
        for attr in resp["UserAttributes"]:
            if attr["Name"] == "sub":
                return attr["Value"]
    except ClientError as e:
        if e.response["Error"]["Code"] == "UserNotFoundException":
            return None
        raise
    return None


def create_cognito_user(email: str, temp_password: str) -> str:
    """Cognito에 사용자 생성 → sub 반환"""
    resp = cognito.admin_create_user(
        UserPoolId=USER_POOL_ID,
        Username=email,
        UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}],
        MessageAction="SUPPRESS",
        TemporaryPassword=temp_password,
    )
    sub = None
    for attr in resp["User"]["Attributes"]:
        if attr["Name"] == "sub":
            sub = attr["Value"]
            break

    # 영구 비밀번호로 즉시 확인 처리
    cognito.admin_set_user_password(
        UserPoolId=USER_POOL_ID,
        Username=email,
        Password=temp_password,
        Permanent=True,
    )
    return sub


def update_user_id(conn, old_id: str, new_id: str, dry_run: bool):
    """auth.users.id를 Cognito sub으로 업데이트 (CASCADE 필요)"""
    if dry_run:
        log.info(f"  [DRY-RUN] UPDATE auth.users SET id='{new_id}' WHERE id='{old_id}'")
        return

    with conn.cursor() as cur:
        # 관련 테이블 FK 순서대로 업데이트
        tables = [
            ("user_svc.preferences", "user_id"),
            ("quiz.user_profiles", "user_id"),
            ("quiz.user_stats", "user_id"),
            ("quiz.user_answers", "user_id"),
            ("community.posts", "author_id"),
            ("community.comments", "author_id"),
            ("community.likes", "user_id"),
            ("community.post_votes", "user_id"),
            ("video_analysis.tasks", "user_id"),
            ("video_analysis.unified_results", "user_id"),
            ("video_analysis.api_keys", "user_id"),
        ]
        for table, col in tables:
            cur.execute(f"UPDATE {table} SET {col} = %s WHERE {col} = %s", (new_id, old_id))
            if cur.rowcount > 0:
                log.info(f"    {table}.{col}: {cur.rowcount}행 업데이트")

        # auth.users 마지막에 업데이트 (FK 제약 순서)
        cur.execute("UPDATE auth.users SET id = %s WHERE id = %s", (new_id, old_id))
    conn.commit()


def migrate(dry_run: bool = False):
    conn = psycopg2.connect(DATABASE_URL)
    try:
        users = get_existing_users(conn)
        log.info(f"마이그레이션 대상: {len(users)}명")

        success, skip, fail = 0, 0, 0
        for user in users:
            old_id = str(user["id"])
            email = user["email"]
            nickname = user.get("nickname") or "탐정"

            log.info(f"처리 중: {email} (현재 ID: {old_id})")

            # 1. 이미 Cognito에 있는지 확인
            cognito_sub = get_cognito_sub(email)

            if cognito_sub is None:
                # 2. Cognito에 없으면 새로 생성
                temp_pw = f"Pf@{uuid.uuid4().hex[:12]}"
                try:
                    cognito_sub = create_cognito_user(email, temp_pw)
                    log.info(f"  Cognito 사용자 생성: sub={cognito_sub}")
                except ClientError as e:
                    log.error(f"  Cognito 생성 실패: {e}")
                    fail += 1
                    continue
            else:
                log.info(f"  기존 Cognito 사용자: sub={cognito_sub}")

            # 3. ID가 이미 일치하면 스킵
            if old_id == cognito_sub:
                log.info(f"  ID 일치 — 스킵")
                skip += 1
                continue

            # 4. DB의 user ID를 Cognito sub으로 업데이트
            try:
                update_user_id(conn, old_id, cognito_sub, dry_run)
                log.info(f"  ID 업데이트 완료: {old_id} → {cognito_sub}")
                success += 1
            except Exception as e:
                log.error(f"  DB 업데이트 실패: {e}")
                conn.rollback()
                fail += 1

        log.info(f"\n완료 — 성공: {success}, 스킵: {skip}, 실패: {fail}")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cognito 마이그레이션")
    parser.add_argument("--dry-run", action="store_true", help="DB 변경 없이 시뮬레이션")
    args = parser.parse_args()

    if args.dry_run:
        log.info("=== DRY-RUN 모드 (DB 변경 없음) ===")
    migrate(dry_run=args.dry_run)
