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

import httpx
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
USER_SERVICE_URL = os.getenv('USER_SERVICE_URL', 'http://user-service:8083')
ADMIN_SERVICE_URL = os.getenv('ADMIN_SERVICE_URL', 'http://admin-service:8082')
COMMUNITY_SERVICE_URL = os.getenv('COMMUNITY_SERVICE_URL', 'http://community-service:8082')

# 월 무료 횟수 (free: 5, premium: 무제한)
FREE_MONTHLY_QUOTA = 5
ANALYSIS_COST_COINS = 10  # 무료 횟수 초과 시 코인 차감


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
        user_id = request.headers.get('X-User-Id') or request.form.get('user_id', '')
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
            "quota": {
                "used": quota_result.get("used", 0),
                "limit": FREE_MONTHLY_QUOTA,
                "premium": quota_result.get("premium", False),
                "coin_used": quota_result.get("coin_used", False),
                "coins_remaining": quota_result.get("coins_remaining"),
            },
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

        task = svc.tasks.get(task_id, {})
        user_id = task.get("user_id", "")
        video_url = task.get("video_url", "")
        community_post_id = task.get("community_post_id")  # 커뮤니티 업로드 시 설정

        if user_id:
            _save_unified_result(task_id, user_id, result)

        # 비동기 파이프라인 (결과 반환 블로킹 없이)
        threading.Thread(
            target=_run_pipelines,
            args=(result, video_url, community_post_id),
            daemon=True,
        ).start()

        return jsonify({"ok": True})

    # ── URL 기반 분석 ─────────────────────────────────────────

    @app.route('/api/video_analysis.VideoAnalysisService/AnalyzeVideo', methods=['POST'])
    def analyze_video():
        data = request.get_json() or {}
        video_url = data.get("video_url")
        user_id = data.get("user_id", "")
        if not video_url:
            return jsonify({"error": "video_url required"}), 400

        task_id = str(uuid.uuid4())
        svc.tasks[task_id] = {"status": "PROCESSING", "result": None, "user_id": user_id}
        threading.Thread(
            target=svc._request_analysis, args=(task_id, video_url), daemon=True
        ).start()
        return jsonify({"taskId": task_id, "task_id": task_id})

    # ── 결과 조회 ────────────────────────────────────────────

    @app.route('/api/video_analysis.VideoAnalysisService/GetAnalysisResult', methods=['POST'])
    def get_analysis_result():
        data = request.get_json() or {}
        task_id = data.get("task_id")
        if not task_id:
            return jsonify({"error": "task_id required"}), 400

        task = svc.tasks.get(task_id)
        if not task:
            return jsonify({"task_id": task_id, "verdict": "NOT_FOUND", "confidence_score": 0.0,
                            "manipulated_regions": [], "frame_samples_analyzed": 0,
                            "model_version": "", "processing_time_ms": 0})

        if task["status"] != "COMPLETED" or not task["result"]:
            return jsonify({"task_id": task_id, "verdict": "PROCESSING", "confidence_score": 0.0,
                            "manipulated_regions": [], "frame_samples_analyzed": 0,
                            "model_version": "", "processing_time_ms": 0})

        r = task["result"]
        return jsonify({
            "task_id": task_id,
            "verdict": r.get("verdict", "UNCERTAIN").upper(),
            "confidence_score": r.get("confidence", 0.0),
            "manipulated_regions": [],
            "frame_samples_analyzed": r.get("meta", {}).get("frames_analyzed", 0),
            "model_version": "ai-orchestration-v1",
            "processing_time_ms": int(r.get("meta", {}).get("latency_ms", 0)),
            "breakdown": r.get("breakdown", {}),
            "explanation": r.get("explanation", ""),
        })

    # ── 분석 이력 ────────────────────────────────────────────

    @app.route('/api/analysis/history', methods=['POST'])
    def analysis_history():
        data = request.get_json() or {}
        user_id = request.headers.get('X-User-Id') or data.get("user_id")
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
        user_id = request.headers.get('X-User-Id') or data.get("user_id")
        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        if _is_premium(user_id):
            return jsonify({"used": 0, "limit": -1, "remaining": -1, "premium": True})

        used = _get_quota_used(user_id)
        return jsonify({
            "used": used,
            "limit": FREE_MONTHLY_QUOTA,
            "remaining": max(0, FREE_MONTHLY_QUOTA - used),
            "premium": False,
        })

    # ── API 키 관리 ──────────────────────────────────────────

    @app.route('/api/keys', methods=['POST'])
    def list_keys():
        data = request.get_json() or {}
        user_id = request.headers.get('X-User-Id') or data.get("user_id")
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
        user_id = request.headers.get('X-User-Id') or data.get("user_id")
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
        user_id = request.headers.get('X-User-Id') or data.get("user_id")
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
    """
    1. user 서비스에서 subscription_type 확인
    2. premium → 무제한 허용
    3. free → Redis 월별 카운터 체크
    4. 무료 횟수 초과 → 코인 차감 시도 (user 서비스 AddRewards)
    5. 코인도 부족 → 거부
    """
    now = datetime.now(timezone.utc)
    reset_at = f"{now.year}-{now.month + 1 if now.month < 12 else 1:02d}-01"

    # 1. 프리미엄 여부 확인 (auth DB 직접 조회)
    if _is_premium(user_id):
        return {"allowed": True, "used": 0, "reset_at": reset_at, "premium": True}

    # 2. Redis 카운터
    r = get_redis()
    key = f"analysis_quota:{user_id}:{now.strftime('%Y-%m')}"
    used = int(r.get(key) or 0)

    if used < FREE_MONTHLY_QUOTA:
        # 무료 횟수 내 → 소비
        new_used = r.incr(key)
        if new_used == 1:
            import calendar
            last_day = calendar.monthrange(now.year, now.month)[1]
            expire_at = datetime(now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc)
            r.expireat(key, int(expire_at.timestamp()))
        return {"allowed": True, "used": new_used, "reset_at": reset_at, "premium": False}

    # 3. 무료 횟수 초과 → 코인 차감 시도
    coin_result = _deduct_coins(user_id, ANALYSIS_COST_COINS)
    if coin_result["success"]:
        return {"allowed": True, "used": used, "reset_at": reset_at, "coin_used": True,
                "coins_remaining": coin_result["total_coins"]}

    # 4. 코인도 부족
    return {"allowed": False, "used": used, "reset_at": reset_at,
            "coins_remaining": coin_result.get("total_coins", 0)}


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


def _is_premium(user_id: str) -> bool:
    """auth.users 테이블에서 subscription_type 확인"""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT subscription_type FROM auth.users WHERE id = %s",
                    (user_id,)
                )
                row = cur.fetchone()
                return row is not None and row["subscription_type"] == "premium"
    except Exception as e:
        logger.error(f"_is_premium failed: {e}")
        return False


def _deduct_coins(user_id: str, amount: int) -> dict:
    """user 서비스 AddRewards(coin_delta 음수)로 코인 차감"""
    try:
        resp = httpx.post(
            f"{USER_SERVICE_URL}/user.UserService/AddRewards",
            json={"user_id": user_id, "xp_delta": 0, "coin_delta": -amount},
            timeout=5,
        )
        data = resp.json()
        return {"success": data.get("success", False), "total_coins": data.get("total_coins", 0)}
    except Exception as e:
        logger.error(f"_deduct_coins failed: {e}")
        return {"success": False, "total_coins": 0}


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


# ── 파이프라인 ────────────────────────────────────────────────

def _run_pipelines(result: dict, video_url: str, community_post_id: str | None):
    """콜백 완료 후 비동기로 실행되는 파이프라인들"""
    _quiz_pipeline(result, video_url)
    if community_post_id:
        _community_tagging_pipeline(result, community_post_id)


def _quiz_pipeline(result: dict, video_url: str):
    """
    퀴즈 자동 생성 파이프라인.
    조건: confidence ≥ 0.85 이고 verdict가 FAKE 또는 REAL
    → admin 서비스 CreateQuestion API로 true_false 문제 후보 생성 (pending 상태)
    어드민이 검수 후 활성화.
    """
    confidence = result.get("confidence", 0.0)
    verdict = result.get("verdict", "").upper()

    if confidence < 0.85 or verdict not in ("FAKE", "REAL"):
        return

    breakdown = result.get("breakdown", {})
    ai_model = breakdown.get("video", {}).get("ai_model")

    # 설명 생성
    if verdict == "FAKE" and ai_model:
        explanation = f"이 영상은 {ai_model}로 생성된 AI 영상입니다. (신뢰도 {confidence:.0%})"
        emoji = "🤖"
    elif verdict == "FAKE":
        explanation = f"이 영상은 AI가 생성한 가짜 영상입니다. (신뢰도 {confidence:.0%})"
        emoji = "🚨"
    else:
        explanation = f"이 영상은 실제 촬영된 진짜 영상입니다. (신뢰도 {confidence:.0%})"
        emoji = "✅"

    correct_answer = verdict == "FAKE"  # true_false: true = 가짜

    payload = {
        "type": "true_false",
        "media_type": "video",
        "media_url": video_url,
        "thumbnail_emoji": emoji,
        "difficulty": "medium" if confidence < 0.92 else "hard",
        "category": ai_model or "deepfake",
        "explanation": explanation,
        "correct_answer": correct_answer,
        "status": "pending",  # 어드민 검수 대기
    }

    try:
        resp = httpx.post(
            f"{ADMIN_SERVICE_URL}/admin/quiz/questions",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        logger.info(f"[quiz_pipeline] Created question candidate: {resp.json().get('id')}")
    except Exception as e:
        logger.error(f"[quiz_pipeline] Failed: {e}")


def _community_tagging_pipeline(result: dict, post_id: str):
    """
    커뮤니티 게시글 자동 태깅.
    분석 결과 → AI 모델명 / REAL / FAKE 태그를 게시글에 추가.
    """
    breakdown = result.get("breakdown", {})
    verdict = result.get("verdict", "").upper()
    ai_model = breakdown.get("video", {}).get("ai_model")

    tags = []
    if verdict == "FAKE":
        tags.append("AI생성")
        if ai_model:
            tags.append(ai_model)  # e.g. "Sora", "Runway"
    elif verdict == "REAL":
        tags.append("실제영상")
    else:
        tags.append("분석불확실")

    if breakdown.get("audio", {}).get("is_synthetic"):
        tags.append("합성음성")

    try:
        resp = httpx.post(
            f"{COMMUNITY_SERVICE_URL}/internal/add-tags",
            json={"post_id": post_id, "tags": tags},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info(f"[community_tagging] Tagged post {post_id}: {tags}")
    except Exception as e:
        logger.error(f"[community_tagging] Failed for post {post_id}: {e}")
