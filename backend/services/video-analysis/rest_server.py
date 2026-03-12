import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS

logger = logging.getLogger(__name__)

def create_app(service):
    app = Flask(__name__)
    CORS(app)

    def handle(path, req_keys, handler):
        @app.route(path, methods=["POST", "OPTIONS"], endpoint=path)
        def route():
            if request.method == "OPTIONS":
                return "", 204
            data = request.get_json(silent=True) or {}
            return handler(data)
        return route

    @app.get("/health")
    def health():
        return "", 200

    def _analyze(data):
        import video_analysis_pb2
        class FakeContext:
            def set_code(self, c): pass
            def set_details(self, d): pass
        req = video_analysis_pb2.AnalyzeVideoRequest(
            video_url=data.get("video_url", ""),
            user_id=data.get("user_id", "")
        )
        resp = service.AnalyzeVideo(req, FakeContext())
        return jsonify({
            "task_id": resp.task_id,
            "verdict": resp.verdict,
            "confidence_score": resp.confidence_score,
            "message": resp.message,
        })

    def _get_result(data):
        import video_analysis_pb2
        class FakeContext:
            def set_code(self, c): pass
            def set_details(self, d): pass
            def abort(self, c, d): raise Exception(d)
        req = video_analysis_pb2.GetAnalysisResultRequest(task_id=data.get("task_id", ""))
        resp = service.GetAnalysisResult(req, FakeContext())
        return jsonify({
            "task_id": resp.task_id,
            "verdict": resp.verdict,
            "confidence_score": resp.confidence_score,
            "manipulated_regions": list(resp.manipulated_regions),
            "frame_samples_analyzed": resp.frame_samples_analyzed,
            "model_version": resp.model_version,
            "processing_time_ms": resp.processing_time_ms,
        })

    def _get_status(data):
        import video_analysis_pb2
        class FakeContext:
            def set_code(self, c): pass
            def set_details(self, d): pass
            def abort(self, c, d): raise Exception(d)
        req = video_analysis_pb2.GetAnalysisStatusRequest(task_id=data.get("task_id", ""))
        try:
            resp = service.GetAnalysisStatus(req, FakeContext())
            return jsonify({"task_id": resp.task_id, "stage": resp.stage})
        except Exception as e:
            return jsonify({"error": str(e)}), 404

    for prefix in ["", "/api"]:
        app.add_url_rule(
            f"{prefix}/video_analysis.VideoAnalysisService/AnalyzeVideo",
            endpoint=f"{prefix}_analyze",
            view_func=lambda: _analyze(request.get_json(silent=True) or {}),
            methods=["POST", "OPTIONS"]
        )
        app.add_url_rule(
            f"{prefix}/video_analysis.VideoAnalysisService/GetAnalysisResult",
            endpoint=f"{prefix}_result",
            view_func=lambda: _get_result(request.get_json(silent=True) or {}),
            methods=["POST", "OPTIONS"]
        )
        app.add_url_rule(
            f"{prefix}/video_analysis.VideoAnalysisService/GetAnalysisStatus",
            endpoint=f"{prefix}_status",
            view_func=lambda: _get_status(request.get_json(silent=True) or {}),
            methods=["POST", "OPTIONS"]
        )

    return app


def run_rest_server(service):
    http_port = int(os.getenv("HTTP_PORT", "8080"))
    app = create_app(service)
    logger.info(f"VideoAnalysis REST server started on :{http_port}")
    app.run(host="0.0.0.0", port=http_port, threaded=True)
