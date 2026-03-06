import grpc
from concurrent import futures
import logging
from typing import Iterator
import asyncio
from datetime import datetime
import uuid
import os

from generated import video_analysis_pb2, video_analysis_pb2_grpc
from kafka_producer import KafkaEventProducer
from deepfake_detector import DeepfakeDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        self.kafka_producer = KafkaEventProducer()
        self.detector = DeepfakeDetector()
        self.tasks = {}

    def UploadVideo(
        self, request_iterator: Iterator[video_analysis_pb2.UploadVideoRequest], context
    ) -> video_analysis_pb2.UploadVideoResponse:
        task_id = str(uuid.uuid4())
        metadata = None
        video_chunks = []

        for request in request_iterator:
            if request.HasField("metadata"):
                metadata = request.metadata
                logger.info(f"Receiving video: {metadata.filename}")
            elif request.HasField("chunk"):
                video_chunks.append(request.chunk)

        if not metadata:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "No metadata provided")

        # Save video and start analysis
        video_path = self._save_video(task_id, video_chunks)
        self.tasks[task_id] = {"status": "UPLOADING", "logs": []}
        
        # Emit event
        self.kafka_producer.emit("video.uploaded", {
            "task_id": task_id,
            "user_id": metadata.user_id,
            "video_path": video_path
        })

        # Start async analysis
        asyncio.create_task(self._analyze_video(task_id, video_path, metadata.user_id))

        return video_analysis_pb2.UploadVideoResponse(
            task_id=task_id,
            message="Video uploaded successfully"
        )

    def GetAnalysisStatus(
        self, request: video_analysis_pb2.GetAnalysisStatusRequest, context
    ) -> video_analysis_pb2.AnalysisStatus:
        task = self.tasks.get(request.task_id)
        if not task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Task not found")

        logs = [
            video_analysis_pb2.LogEntry(
                timestamp=log["timestamp"],
                message=log["message"],
                type=log["type"]
            )
            for log in task.get("logs", [])
        ]

        return video_analysis_pb2.AnalysisStatus(
            task_id=request.task_id,
            stage=task["status"],
            logs=logs
        )

    def GetAnalysisResult(
        self, request: video_analysis_pb2.GetAnalysisResultRequest, context
    ) -> video_analysis_pb2.DeepfakeReport:
        task = self.tasks.get(request.task_id)
        if not task or "result" not in task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Result not available")

        result = task["result"]
        regions = [
            video_analysis_pb2.ManipulatedRegion(
                label=r["label"],
                confidence=r["confidence"]
            )
            for r in result.get("manipulated_regions", [])
        ]

        return video_analysis_pb2.DeepfakeReport(
            task_id=request.task_id,
            verdict=result["verdict"],
            confidence_score=result["confidence_score"],
            manipulated_regions=regions,
            frame_samples_analyzed=result["frame_samples_analyzed"],
            model_version=result["model_version"],
            processing_time_ms=result["processing_time_ms"]
        )

    def _save_video(self, task_id: str, chunks: list) -> str:
        video_path = f"/tmp/videos/{task_id}.mp4"
        with open(video_path, "wb") as f:
            for chunk in chunks:
                f.write(chunk)
        return video_path

    async def _analyze_video(self, task_id: str, video_path: str, user_id: str):
        self._add_log(task_id, "Starting analysis", "info")
        self.tasks[task_id]["status"] = "SAGEMAKER_PROCESSING"

        try:
            result = await self.detector.analyze(video_path)
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            self._add_log(task_id, "Analysis completed", "success")

            self.kafka_producer.emit("analysis.completed", {
                "task_id": task_id,
                "user_id": user_id,
                "verdict": result["verdict"]
            })
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            self.tasks[task_id]["status"] = "ERROR"
            self._add_log(task_id, f"Error: {str(e)}", "error")

    def _add_log(self, task_id: str, message: str, log_type: str):
        if task_id in self.tasks:
            self.tasks[task_id]["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "message": message,
                "type": log_type
            })


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(
        VideoAnalysisService(), server
    )
    port = os.getenv("PORT", "50054")
    server.add_insecure_port(f"[::]:{port}")
    logger.info(f"Video Analysis Service started on port {port}")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
