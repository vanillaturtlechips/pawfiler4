"""
video-analysis 서비스
=====================
역할: 영상 수신 → S3 저장 → ai-orchestration 분석 요청 → 결과 반환
AI 추론 없음. 모델 없음. 경량 CPU 파드.

설계 원칙:
    - 파일 수신/저장/task 관리만 담당
    - AI 추론은 ai-orchestration 서비스에 위임
    - ai-orchestration이 분석 완료 후 /internal/callback으로 결과 전달
"""

import os
import sys
import uuid
import logging
import threading

import grpc
import boto3
import httpx
from concurrent import futures
from datetime import datetime

from generated import video_analysis_pb2, video_analysis_pb2_grpc
from media_inspector import MediaInspector

sys.path.insert(0, '/app')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

S3_BUCKET = os.getenv('S3_BUCKET', 'pawfiler-videos')
AI_ORCHESTRATION_URL = os.getenv('AI_ORCHESTRATION_URL', 'http://ai-orchestration:8000')

s3_client = boto3.client('s3', region_name='ap-northeast-2')


class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        # task_id → {"status": str, "result": dict | None}
        self.tasks: dict = {}

    # ── 업로드 ──────────────────────────────────────────────────

    def UploadVideo(self, request_iterator, context):
        """스트리밍 업로드 → S3 저장 → ai-orchestration 분석 요청"""
        metadata = None
        chunks = []

        for req in request_iterator:
            if req.HasField('metadata'):
                metadata = req.metadata
            elif req.HasField('chunk'):
                chunks.append(req.chunk)

        if not metadata:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("No metadata provided")
            return video_analysis_pb2.UploadVideoResponse()

        task_id = str(uuid.uuid4())
        s3_key = f"uploads/{metadata.user_id}/{task_id}-{metadata.filename}"

        try:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=b''.join(chunks),
                ContentType='video/mp4',
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"S3 upload failed: {e}")
            return video_analysis_pb2.UploadVideoResponse()

        media_url = f"s3://{S3_BUCKET}/{s3_key}"
        self.tasks[task_id] = {"status": "PROCESSING", "result": None}

        # ai-orchestration 비동기 호출
        threading.Thread(
            target=self._request_analysis,
            args=(task_id, media_url),
            daemon=True,
        ).start()

        logger.info(f"[{task_id}] Uploaded → {s3_key}")
        return video_analysis_pb2.UploadVideoResponse(
            task_id=task_id,
            message="Upload successful, analysis started",
        )

    # ── 결과 조회 ────────────────────────────────────────────────

    def GetAnalysisResult(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task:
            return video_analysis_pb2.DeepfakeReport(
                task_id=request.task_id, verdict="NOT_FOUND", confidence_score=0.0,
                manipulated_regions=[], frame_samples_analyzed=0,
                model_version="", processing_time_ms=0,
            )
        if task["status"] != "COMPLETED" or not task["result"]:
            return video_analysis_pb2.DeepfakeReport(
                task_id=request.task_id, verdict="PROCESSING", confidence_score=0.0,
                manipulated_regions=[], frame_samples_analyzed=0,
                model_version="", processing_time_ms=0,
            )
        r = task["result"]
        return video_analysis_pb2.DeepfakeReport(
            task_id=request.task_id,
            verdict=r.get("verdict", "UNCERTAIN"),
            confidence_score=r.get("confidence", 0.0),
            manipulated_regions=[],
            frame_samples_analyzed=r.get("meta", {}).get("frames_analyzed", 0),
            model_version="ai-orchestration-v1",
            processing_time_ms=int(r.get("meta", {}).get("latency_ms", 0)),
        )

    def GetUnifiedResult(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Task not found")

        if task["status"] != "COMPLETED" or not task["result"]:
            context.abort(grpc.StatusCode.UNAVAILABLE, "Analysis not completed")

        r = task["result"]
        breakdown = r.get("breakdown", {})

        # Visual
        visual_pb = None
        if "video" in breakdown:
            v = breakdown["video"]
            visual_pb = video_analysis_pb2.VisualAnalysis(
                verdict="FAKE" if v.get("is_fake") else "REAL",
                confidence=v.get("confidence", 0.0),
                frames_analyzed=r.get("meta", {}).get("frames_analyzed", 0),
            )

        # Audio
        audio_pb = None
        if "audio" in breakdown:
            a = breakdown["audio"]
            audio_pb = video_analysis_pb2.AudioAnalysis(
                is_synthetic=a.get("is_synthetic", False),
                confidence=a.get("confidence", 0.0),
                method=a.get("voice_model") or "unknown",
            )

        verdict = r.get("verdict", "UNCERTAIN").upper()
        return video_analysis_pb2.UnifiedReport(
            task_id=request.task_id,
            final_verdict=verdict,
            confidence=r.get("confidence", 0.0),
            visual=visual_pb,
            audio=audio_pb,
            warnings=[],
            total_processing_time_ms=int(r.get("meta", {}).get("latency_ms", 0)),
        )

    def GetAnalysisStatus(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Task not found")
        return video_analysis_pb2.AnalysisStatus(
            task_id=request.task_id,
            stage=task["status"],
            logs=[],
        )

    # ── Internal: ai-orchestration 호출 ─────────────────────────

    def _request_analysis(self, task_id: str, media_url: str):
        """ai-orchestration에 분석 요청. 결과는 /internal/callback으로 수신."""
        try:
            resp = httpx.post(
                f"{AI_ORCHESTRATION_URL}/analyze",
                json={
                    "media_url": media_url,
                    "task_id": task_id,
                    "modality": "both",
                },
                timeout=300,
            )
            resp.raise_for_status()
            # 동기 응답 방식일 경우 바로 저장 (콜백 방식이면 아래 receive_callback 사용)
            result = resp.json()
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            logger.info(f"[{task_id}] Analysis completed: {result.get('verdict')}")
        except Exception as e:
            self.tasks[task_id]["status"] = "ERROR"
            logger.error(f"[{task_id}] ai-orchestration request failed: {e}")

    def receive_callback(self, task_id: str, result: dict):
        """ai-orchestration 콜백 수신 (REST 서버에서 호출)"""
        if task_id not in self.tasks:
            logger.warning(f"[{task_id}] Unknown task in callback")
            return
        self.tasks[task_id]["result"] = result
        self.tasks[task_id]["status"] = "COMPLETED"
        logger.info(f"[{task_id}] Callback received: {result.get('verdict')}")


# ── gRPC 서버 시작 ───────────────────────────────────────────────

def serve():
    from grpc_health.v1 import health, health_pb2, health_pb2_grpc
    from rest_server import run_rest_server

    svc = VideoAnalysisService()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(svc, server)

    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port("[::]:50054")
    logger.info("🚀 video-analysis gRPC :50054")
    server.start()

    threading.Thread(target=run_rest_server, args=(svc,), daemon=True).start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
