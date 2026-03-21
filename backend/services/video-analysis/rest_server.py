"""
REST 서버 — /api/upload-video (multipart) + /internal/callback
프론트엔드 파일 업로드 및 ai-orchestration 콜백 수신용.
"""

import logging
from flask import Flask, request, jsonify
from flask_cors import CORS

logger = logging.getLogger(__name__)


def run_rest_server(svc):
    app = Flask(__name__)
    CORS(app)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok"})

    @app.route('/api/upload-video', methods=['POST'])
    def upload_video():
        """프론트엔드 multipart 업로드 → S3 저장 → 분석 요청"""
        import uuid, boto3, os, threading
        from media_inspector import MediaInspector

        file = request.files.get('video')
        user_id = request.form.get('user_id', 'anonymous')

        if not file:
            return jsonify({"error": "No video file"}), 400

        task_id = str(uuid.uuid4())
        s3_key = f"uploads/{user_id}/{task_id}-{file.filename}"
        s3_bucket = os.getenv('S3_BUCKET', 'pawfiler-videos')

        try:
            boto3.client('s3', region_name='ap-northeast-2').upload_fileobj(
                file, s3_bucket, s3_key, ExtraArgs={'ContentType': 'video/mp4'}
            )
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            return jsonify({"error": "Upload failed"}), 500

        media_url = f"s3://{s3_bucket}/{s3_key}"
        svc.tasks[task_id] = {"status": "PROCESSING", "result": None}
        threading.Thread(
            target=svc._request_analysis, args=(task_id, media_url), daemon=True
        ).start()

        return jsonify({"taskId": task_id})

    @app.route('/internal/callback', methods=['POST'])
    def callback():
        """ai-orchestration이 분석 완료 후 결과 전달"""
        data = request.get_json()
        task_id = data.get("task_id")
        result = data.get("result")
        if not task_id or not result:
            return jsonify({"error": "Invalid payload"}), 400
        svc.receive_callback(task_id, result)
        return jsonify({"ok": True})

    app.run(host='0.0.0.0', port=8080, threaded=True)
