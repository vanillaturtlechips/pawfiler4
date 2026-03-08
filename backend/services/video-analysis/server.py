import grpc
from concurrent import futures
import logging
from typing import Iterator
import asyncio
from datetime import datetime
import uuid
import os

from generated import video_analysis_pb2, video_analysis_pb2_grpc
from local_detector import LocalDeepfakeDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        self.detector = LocalDeepfakeDetector()
        self.tasks = {}

    def UploadVideo(self, request_iterator, context):
        task_id = str(uuid.uuid4())
        metadata = None
        video_chunks = []

        for request in request_iterator:
            if request.HasField("metadata"):
                metadata = request.metadata
            elif request.HasField("chunk"):
                video_chunks.append(request.chunk)

        os.makedirs("/tmp/videos", exist_ok=True)
        video_path = f"/tmp/videos/{task_id}.mp4"
        with open(video_path, "wb") as f:
            for chunk in video_chunks:
                f.write(chunk)
        
        self.tasks[task_id] = {"status": "UPLOADING", "logs": [], "video_path": video_path}
        asyncio.create_task(self._analyze(task_id))
        
        return video_analysis_pb2.UploadVideoResponse(task_id=task_id, message="OK")

    def GetAnalysisStatus(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Task not found")
        
        logs = [video_analysis_pb2.LogEntry(timestamp=l["timestamp"], message=l["message"], type=l["type"]) 
                for l in task.get("logs", [])]
        return video_analysis_pb2.AnalysisStatus(task_id=request.task_id, stage=task["status"], logs=logs)

    def GetAnalysisResult(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task or "result" not in task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Result not available")
        
        r = task["result"]
        return video_analysis_pb2.DeepfakeReport(
            task_id=request.task_id,
            verdict=r["verdict"],
            confidence_score=r["confidence_score"],
            manipulated_regions=[],
            frame_samples_analyzed=r["frame_samples_analyzed"],
            model_version=r["model_version"],
            processing_time_ms=r["processing_time_ms"]
        )

    async def _analyze(self, task_id):
        self.tasks[task_id]["status"] = "ANALYZING"
        self.tasks[task_id]["logs"].append({"timestamp": datetime.now().isoformat(), "message": "Analyzing...", "type": "info"})
        
        try:
            result = await self.detector.analyze(self.tasks[task_id]["video_path"])
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            logger.info(f"✅ {task_id}: {result['verdict']} ({result['confidence_score']:.2%})")
        except Exception as e:
            self.tasks[task_id]["status"] = "ERROR"
            logger.error(f"❌ {task_id}: {e}")

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(VideoAnalysisService(), server)
    server.add_insecure_port("[::]:50054")
    logger.info("🚀 Server started on :50054")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
