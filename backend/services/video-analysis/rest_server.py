"""
REST 서버
- /api/upload-video       : 프론트 파일 업로드
- /internal/callback      : ai-orchestration 결과 수신
- /api/analysis/history   : 분석 이력 조회
- /api/analysis/quota     : 남은 횟수 조회
- /api/keys               : API 키 목록
- /api/keys/generate      : API 키 발급
- /api/keys/revoke        : API 키 삭제
"""

import os
import uuid
import hashlib
import logging
import threading
import secrets
from datetime import datetime, timezone

import boto3
import psycopg2
import psycopg2.extras
import redis
from flask import Flask, request, jsonify
from flask_cors import CORS

logger = logging.getLogger(__name__)

DB_DSN = os.getenv('DATABASE_URL', '')
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
S3_BUCKET = os.getenv('S3_BUCKET', 'pawfiler-videos')

# 월 무료 횟수 (free: 5, premium: -1 = 무제한)
FREE_MONTHLY_QUOTA = 5
ANALYSIS_COST_COINS = 10  # 초과 시 코인 차감


def get_db():
    return psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)


def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)


def run_rest_server(svc):
    app = Flask(__name__)
    CORS(app)

    # ── Health ──────────────────────────────────────────────

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok"})

    # ── 업로드 ───────────────────────────────────────────────

    @app.route('/api/upload-video', methods=['POST'])
    def upload_video():
        """파일 업로드 → 횟수 체크 → S3 → 분석 요청"""
        file = request.files.get('video')
        user_id = request.form.get('user_id', '')
        api_key = request.headers.get('X-API-Key')

        if not file:
            return jsonify({"error": "No video file"}), 400

        # API 키 인증 (외부 호출)
        if api_key:
            if not _verify_api_key(api_key):
                return jsonify({"error": "Invalid API key"}), 401
            user_id = _get_user_by_api_key(api_key)

        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        # 횟수 제한 체크
        quota_result = _check_and_consume_quota(user_id)
        if not quota_result["allowed"]:
            return jsonify({
                "error": "분석 횟수를 초과했어요",
                "used": quota_result["used"],
                "limit": FREE_MONTHLY_QUOTA,
                "reset_at": quota_result["reset_at"],
            }), 429

        task_id = str(uuid.uuid4())
        s3_key = f"uploads/{user_id}/{task_id}-{file.filename}"

        try:
            boto3.client('s3', region_name='ap-northeast-2').upload_fileobj(
                file, S3_BUCKET, s3_key, ExtraArgs={'ContentType': 'video/mp4'}
            )
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            _rollback_quota(user_id)
            return jsonify({"error": "Upload failed"}), 500

        # task DB 저장
        _save_task(task_id, user_id, f"s3://{S3_BUCKET}/{s3_key}")

        media_url = f"s3://{S3_BUCKET}/{s3_key}"
        svc.tasks[task_id] = {"status": "PROCESSING", "result": None, "user_id": user_id}
        threading.Thread(
            target=svc._request_analysis, args=(task_id, media_url), daemon=True
        ).start()

        return jsonify({
            "taskId": task_id,
            "quota": {"used": quota_result["used"], "limit": FREE_MONTHLY_QUOTA},
        })

    # ── ai-orchestration 콜백 ────────────────────────────────

    @app.route('/internal/callback', methods=['POST'])
    def callback():
        data = request.get_json()
        task_id = data.get("task_id")
        result = data.get("result")
        if not task_id or not result:
            return jsonify({"error": "Invalid payload"}), 400

        svc.receive_callback(task_id, result)

        # 이력 저장
        user_id = svc.tasks.get(task_id, {}).get("user_id", "")
        if user_id:
            _save_unified_result(task_id, user_id, result)

        return jsonify({"ok": True})

    # ── 분석 이력 ────────────────────────────────────────────

    @app.route('/api/analysis/history', methods=['POST'])
    def analysis_history():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT ur.task_id, ur.final_verdict, ur.confidence,
                               ur.ai_model, ur.created_at,
                               t.video_url
                        FROM video_analysis.unified_results ur
                        JOIN video_analysis.tasks t ON t.id = ur.task_id
                        WHERE ur.user_id = %s
                        ORDER BY ur.created_at DESC
                        LIMIT 20
                    """, (user_id,))
                    rows = cur.fetchall()
        except Exception as e:
            logger.error(f"history query failed: {e}")
            return jsonify({"history": []})

        return jsonify({"history": [dict(r) for r in rows]})

    # ── 횟수 조회 ────────────────────────────────────────────

    @app.route('/api/analysis/quota', methods=['POST'])
    def analysis_quota():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        used = _get_quota_used(user_id)
        return jsonify({
            "used": used,
            "limit": FREE_MONTHLY_QUOTA,
            "remaining": max(0, FREE_MONTHLY_QUOTA - used),
        })

    # ── API 키 관리 ──────────────────────────────────────────

    @app.route('/api/keys', methods=['POST'])
    def list_keys():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, name, key_prefix, last_used_at, created_at
                        FROM video_analysis.api_keys
                        WHERE user_id = %s AND revoked_at IS NULL
                        ORDER BY created_at DESC
                    """, (user_id,))
                    rows = cur.fetchall()
        except Exception as e:
            logger.error(f"list keys failed: {e}")
            return jsonify({"keys": []})

        return jsonify({"keys": [dict(r) for r in rows]})

    @app.route('/api/keys/generate', methods=['POST'])
    def generate_key():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        name = data.get("name", "").strip()
        if not user_id or not name:
            return jsonify({"error": "user_id and name required"}), 400

        raw_key = "pf_" + secrets.token_hex(24)
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:11]  # 'pf_' + 앞 8자
        key_id = str(uuid.uuid4())

        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO video_analysis.api_keys
                            (id, user_id, name, key_hash, key_prefix)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (key_id, user_id, name, key_hash, key_prefix))
                conn.commit()
        except Exception as e:
            logger.error(f"generate key failed: {e}")
            return jsonify({"error": "Failed to generate key"}), 500

        # 원문은 생성 시 1회만 반환
        return jsonify({
            "id": key_id,
            "name": name,
            "key": raw_key,
            "key_prefix": key_prefix,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    @app.route('/api/keys/revoke', methods=['POST'])
    def revoke_key():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        key_id = data.get("key_id")
        if not user_id or not key_id:
            return jsonify({"error": "user_id and key_id required"}), 400

        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE video_analysis.api_keys
                        SET revoked_at = NOW()
                        WHERE id = %s AND user_id = %s
                    """, (key_id, user_id))
                conn.commit()
        except Exception as e:
            logger.error(f"revoke key failed: {e}")
            return jsonify({"error": "Failed to revoke key"}), 500

        return jsonify({"ok": True})

    app.run(host='0.0.0.0', port=8080, threaded=True)


# ── 내부 헬퍼 ────────────────────────────────────────────────

def _check_and_consume_quota(user_id: str) -> dict:
    """Redis로 월별 횟수 체크 + 소비. 키: analysis_quota:{user_id}:{YYYY-MM}"""
    r = get_redis()
    now = datetime.now(timezone.utc)
    key = f"analysis_quota:{user_id}:{now.strftime('%Y-%m')}"

    used = r.incr(key)
    if used == 1:
        # 월말까지 TTL 설정
        import calendar
        last_day = calendar.monthrange(now.year, now.month)[1]
        expire_at = datetime(now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        r.expireat(key, int(expire_at.timestamp()))

    reset_at = f"{now.year}-{now.month + 1 if now.month < 12 else 1:02d}-01"
    return {
        "allowed": used <= FREE_MONTHLY_QUOTA,
        "used": used,
        "reset_at": reset_at,
    }


def _rollback_quota(user_id: str):
    r = get_redis()
    now = datetime.now(timezone.utc)
    key = f"analysis_quota:{user_id}:{now.strftime('%Y-%m')}"
    r.decr(key)


def _get_quota_used(user_id: str) -> int:
    r = get_redis()
    now = datetime.now(timezone.utc)
    key = f"analysis_quota:{user_id}:{now.strftime('%Y-%m')}"
    return int(r.get(key) or 0)


def _save_task(task_id: str, user_id: str, video_url: str):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO video_analysis.tasks (id, user_id, video_url, status)
                    VALUES (%s, %s, %s, 'PROCESSING')
                    ON CONFLICT (id) DO NOTHING
                """, (task_id, user_id, video_url))
            conn.commit()
    except Exception as e:
        logger.error(f"save task failed: {e}")


def _save_unified_result(task_id: str, user_id: str, result: dict):
    breakdown = result.get("breakdown", {})
    ai_model = breakdown.get("video", {}).get("ai_model")
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO video_analysis.unified_results
                        (task_id, user_id, final_verdict, confidence, ai_model, breakdown, total_processing_ms)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    task_id, user_id,
                    result.get("verdict", "UNCERTAIN").upper(),
                    result.get("confidence", 0.0),
                    ai_model,
                    psycopg2.extras.Json(breakdown),
                    int(result.get("meta", {}).get("latency_ms", 0)),
                ))
                # task 상태 업데이트
                cur.execute("""
                    UPDATE video_analysis.tasks SET status = 'COMPLETED', updated_at = NOW()
                    WHERE id = %s
                """, (task_id,))
            conn.commit()
    except Exception as e:
        logger.error(f"save unified result failed: {e}")


def _verify_api_key(raw_key: str) -> bool:
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM video_analysis.api_keys
                    WHERE key_hash = %s AND revoked_at IS NULL
                """, (key_hash,))
                return cur.fetchone() is not None
    except Exception:
        return False


def _get_user_by_api_key(raw_key: str) -> str:
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE video_analysis.api_keys
                    SET last_used_at = NOW()
                    WHERE key_hash = %s AND revoked_at IS NULL
                    RETURNING user_id
                """, (key_hash,))
                row = cur.fetchone()
                conn.commit()
                return str(row["user_id"]) if row else ""
    except Exception:
        return ""
