import sys
import os

# PYTHONPATH 설정을 최우선으로
sys.path.insert(0, '/app')

import grpc
from concurrent import futures
import logging
from typing import Iterator
import asyncio
from datetime import datetime
import uuid
import boto3

from generated import video_analysis_pb2, video_analysis_pb2_grpc
from local_detector import LocalDeepfakeDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

S3_BUCKET = os.getenv('S3_BUCKET', 'pawfiler-videos')
s3_client = boto3.client('s3', region_name='ap-northeast-2')

class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        self.detector = LocalDeepfakeDetector()
        self.tasks = {}

    def GetUploadUrl(self, request, context):
        """Deprecated - use direct upload instead"""
        user_id = request.user_id
        filename = request.filename
        key = f"uploads/{user_id}/{uuid.uuid4()}-{filename}"
        
        # 직접 S3에 업로드
        try:
            # 빈 객체 생성 (실제 업로드는 UploadVideo 사용)
            video_url = f"https://{S3_BUCKET}.s3.ap-northeast-2.amazonaws.com/{key}"
            return video_analysis_pb2.GetUploadUrlResponse(
                upload_url="",  # 사용 안 함
                video_url=video_url
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Upload failed: {str(e)}")
            return video_analysis_pb2.GetUploadUrlResponse()

    def UploadVideo(self, request_iterator, context):
        """스트리밍 업로드"""
        metadata = None
        chunks = []
        
        for request in request_iterator:
            if request.HasField('metadata'):
                metadata = request.metadata
            elif request.HasField('chunk'):
                chunks.append(request.chunk)
        
        if not metadata:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("No metadata provided")
            return video_analysis_pb2.UploadVideoResponse()
        
        # S3에 업로드
        key = f"uploads/{metadata.user_id}/{uuid.uuid4()}-{metadata.filename}"
        video_data = b''.join(chunks)
        
        try:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=video_data,
                ContentType='video/mp4'
            )
            
            video_url = f"https://{S3_BUCKET}.s3.ap-northeast-2.amazonaws.com/{key}"
            task_id = str(uuid.uuid4())
            
            # 분석 시작
            self.tasks[task_id] = {"status": "PROCESSING", "logs": [], "video_url": video_url}
            asyncio.create_task(self._analyze_url(task_id, video_url))
            
            return video_analysis_pb2.UploadVideoResponse(
                task_id=task_id,
                message="Upload successful, analysis started"
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Upload failed: {str(e)}")
            return video_analysis_pb2.UploadVideoResponse()

    def AnalyzeVideo(self, request, context):
        task_id = str(uuid.uuid4())
        video_url = request.video_url
        
        self.tasks[task_id] = {"status": "PROCESSING", "logs": [], "video_url": video_url}
        asyncio.create_task(self._analyze_url(task_id, video_url))
        
        return video_analysis_pb2.AnalyzeVideoResponse(
            task_id=task_id,
            verdict="PROCESSING",
            confidence_score=0.0,
            message="Analysis started"
        )

    def AnalyzeVideo(self, request, context):
        task_id = str(uuid.uuid4())
        video_url = request.video_url
        
        self.tasks[task_id] = {"status": "PROCESSING", "logs": [], "video_url": video_url}
        
        # 백그라운드 스레드에서 실행
        import threading
        thread = threading.Thread(target=self._analyze_url_sync, args=(task_id, video_url))
        thread.start()
        
        return video_analysis_pb2.AnalyzeVideoResponse(
            task_id=task_id,
            verdict="PROCESSING",
            confidence_score=0.0,
            message="Analysis started"
        )

    def _analyze_url_sync(self, task_id, video_url):
        import urllib.request
        from urllib.parse import quote
        self.tasks[task_id]["status"] = "DOWNLOADING"
        
        try:
            os.makedirs("/tmp/videos", exist_ok=True)
            video_path = f"/tmp/videos/{task_id}.mp4"
            
            # URL encode non-ASCII characters
            if '://' in video_url:
                scheme, rest = video_url.split('://', 1)
                if '/' in rest:
                    domain, path = rest.split('/', 1)
                    encoded_url = f"{scheme}://{domain}/{quote(path, safe='/')}"
                else:
                    encoded_url = video_url
            else:
                encoded_url = quote(video_url, safe=':/')
            
            urllib.request.urlretrieve(encoded_url, video_path)
            
            self.tasks[task_id]["video_path"] = video_path
            self.tasks[task_id]["status"] = "ANALYZING"
            
            # 동기 방식으로 실행
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(self.detector.analyze(video_path))
            loop.close()
            
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            logger.info(f"✅ {task_id}: {result['verdict']} ({result['confidence_score']:.2%})")
        except Exception as e:
            self.tasks[task_id]["status"] = "ERROR"
            logger.error(f"❌ {task_id}: {e}")

    async def _analyze_url(self, task_id, video_url):
        import urllib.request
        self.tasks[task_id]["status"] = "DOWNLOADING"
        
        try:
            os.makedirs("/tmp/videos", exist_ok=True)
            video_path = f"/tmp/videos/{task_id}.mp4"
            urllib.request.urlretrieve(video_url, video_path)
            
            self.tasks[task_id]["video_path"] = video_path
            self.tasks[task_id]["status"] = "ANALYZING"
            
            result = await self.detector.analyze(video_path)
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            logger.info(f"✅ {task_id}: {result['verdict']} ({result['confidence_score']:.2%})")
        except Exception as e:
            self.tasks[task_id]["status"] = "ERROR"
            logger.error(f"❌ {task_id}: {e}")

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
        if not task:
            return video_analysis_pb2.DeepfakeReport(
                task_id=request.task_id,
                verdict="NOT_FOUND",
                confidence_score=0.0,
                manipulated_regions=[],
                frame_samples_analyzed=0,
                model_version="",
                processing_time_ms=0
            )
        
        if "result" not in task:
            return video_analysis_pb2.DeepfakeReport(
                task_id=request.task_id,
                verdict="PROCESSING",
                confidence_score=0.0,
                manipulated_regions=[],
                frame_samples_analyzed=0,
                model_version="",
                processing_time_ms=0
            )
        
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

    async def _analyze_url(self, task_id, video_url):
        import urllib.request
        self.tasks[task_id]["status"] = "DOWNLOADING"
        
        try:
            os.makedirs("/tmp/videos", exist_ok=True)
            video_path = f"/tmp/videos/{task_id}.mp4"
            urllib.request.urlretrieve(video_url, video_path)
            
            self.tasks[task_id]["video_path"] = video_path
            self.tasks[task_id]["status"] = "ANALYZING"
            
            result = await self.detector.analyze(video_path)
            self.tasks[task_id]["result"] = result
            self.tasks[task_id]["status"] = "COMPLETED"
            logger.info(f"✅ {task_id}: {result['verdict']} ({result['confidence_score']:.2%})")
        except Exception as e:
            self.tasks[task_id]["status"] = "ERROR"
            logger.error(f"❌ {task_id}: {e}")

def serve():
    from grpc_health.v1 import health
    from grpc_health.v1 import health_pb2, health_pb2_grpc
    
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(VideoAnalysisService(), server)
    
    # Health check 추가
    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    
    server.add_insecure_port("[::]:50054")
    logger.info("🚀 Server started on :50054")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
