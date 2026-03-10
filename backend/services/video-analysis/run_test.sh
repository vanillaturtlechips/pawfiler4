#!/bin/bash
cd "$(dirname "$0")"

# 1. 간단한 서버 작성
cat > server_minimal.py << 'PYEOF'
import grpc, asyncio, os, uuid
from concurrent import futures
from datetime import datetime
from generated import video_analysis_pb2, video_analysis_pb2_grpc
from local_detector import LocalDeepfakeDetector

class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        self.detector = LocalDeepfakeDetector()
        self.tasks = {}

    def UploadVideo(self, request_iterator, context):
        task_id = str(uuid.uuid4())
        chunks = []
        for req in request_iterator:
            if req.HasField("chunk"):
                chunks.append(req.chunk)
        
        os.makedirs("/tmp/videos", exist_ok=True)
        path = f"/tmp/videos/{task_id}.mp4"
        with open(path, "wb") as f:
            for c in chunks: f.write(c)
        
        self.tasks[task_id] = {"status": "ANALYZING", "path": path, "logs": []}
        asyncio.create_task(self._analyze(task_id))
        return video_analysis_pb2.UploadVideoResponse(task_id=task_id, message="OK")

    def GetAnalysisStatus(self, request, context):
        task = self.tasks.get(request.task_id, {})
        return video_analysis_pb2.AnalysisStatus(
            task_id=request.task_id, 
            stage=task.get("status", "UNKNOWN"),
            logs=[]
        )

    def GetAnalysisResult(self, request, context):
        task = self.tasks.get(request.task_id)
        if not task or "result" not in task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Not ready")
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
        result = await self.detector.analyze(self.tasks[task_id]["path"])
        self.tasks[task_id]["result"] = result
        self.tasks[task_id]["status"] = "COMPLETED"
        print(f"✅ {task_id}: {result['verdict']} ({result['confidence_score']:.2%})")

server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(VideoAnalysisService(), server)
server.add_insecure_port("[::]:50054")
print("🚀 Server on :50054")
server.start()
server.wait_for_termination()
PYEOF

echo "서버와 클라이언트 파일 준비 완료"
echo "실행: source venv/bin/activate && python server_minimal.py"
