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
from media_inspector import MediaInspector
from lambda_invoker import LambdaInvoker
from result_aggregator import ResultAggregator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

S3_BUCKET = os.getenv('S3_BUCKET', 'pawfiler-videos')
s3_client = boto3.client('s3', region_name='ap-northeast-2')

class VideoAnalysisService(video_analysis_pb2_grpc.VideoAnalysisServiceServicer):
    def __init__(self):
        self.detector = LocalDeepfakeDetector()
        self.tasks = {}
        self.lambda_invoker = LambdaInvoker()

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
        
        self.tasks[task_id] = {
            "status": "PROCESSING",
            "logs": [],
            "video_url": video_url,
            "visual_result": None,
            "audio_result": None
        }
        
        # 백그라운드 스레드에서 실행
        import threading
        thread = threading.Thread(target=self._analyze_multimodal, args=(task_id, video_url))
        thread.start()
        
        return video_analysis_pb2.AnalyzeVideoResponse(
            task_id=task_id,
            verdict="PROCESSING",
            confidence_score=0.0,
            message="Analysis started"
        )
    
    def _analyze_multimodal(self, task_id, video_url):
        """멀티모달 분석 오케스트레이션"""
        import urllib.request
        from urllib.parse import quote
        
        try:
            # 1. 다운로드
            self.tasks[task_id]["status"] = "DOWNLOADING"
            os.makedirs("/tmp/videos", exist_ok=True)
            video_path = f"/tmp/videos/{task_id}.mp4"
            
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
            
            # 2. 메타데이터 검사
            self.tasks[task_id]["status"] = "INSPECTING"
            meta = MediaInspector.inspect(video_path)
            self.tasks[task_id]["metadata"] = meta
            
            # 3. S3 업로드
            s3_key = f"analysis/{task_id}.mp4"
            s3_client.upload_file(video_path, S3_BUCKET, s3_key)
            
            # 4. Lambda 호출 (병렬)
            self.tasks[task_id]["status"] = "LAMBDA_INVOKED"
            self.lambda_invoker.invoke_visual(s3_key, task_id)
            
            if meta['has_audio']:
                self.lambda_invoker.invoke_audio(s3_key, task_id)
            
            # 5. 결과 대기 (폴링 - 실제로는 Lambda가 RDS에 저장)
            # 여기서는 로컬 실행으로 대체
            self.tasks[task_id]["status"] = "ANALYZING"
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            visual_result = loop.run_until_complete(self.detector.analyze(video_path))
            loop.close()
            
            self.tasks[task_id]["visual_result"] = visual_result
            self.tasks[task_id]["status"] = "COMPLETED"
            
            logger.info(f"✅ {task_id}: Analysis completed")
            
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
    
    def GetUnifiedResult(self, request, context):
        """통합 결과 반환 (멀티모달)"""
        task = self.tasks.get(request.task_id)
        if not task:
            context.abort(grpc.StatusCode.NOT_FOUND, "Task not found")
        
        if task["status"] != "COMPLETED":
            context.abort(grpc.StatusCode.UNAVAILABLE, "Analysis not completed")
        
        # 결과 통합
        unified = ResultAggregator.merge(
            visual=task.get("visual_result"),
            audio=task.get("audio_result"),
            meta=task.get("metadata", {})
        )
        
        # proto 메시지 생성
        visual_pb = None
        if unified['visual']:
            v = unified['visual']
            visual_pb = video_analysis_pb2.VisualAnalysis(
                verdict=v['verdict'],
                confidence=v['confidence_score'],
                frames_analyzed=v['frame_samples_analyzed']
            )
        
        audio_pb = None
        if unified['audio']:
            a = unified['audio']
            audio_pb = video_analysis_pb2.AudioAnalysis(
                is_synthetic=a['is_synthetic'],
                confidence=a['confidence'],
                method=a['method']
            )
        
        return video_analysis_pb2.UnifiedReport(
            task_id=request.task_id,
            final_verdict=unified['final_verdict'],
            confidence=unified['confidence'],
            visual=visual_pb,
            audio=audio_pb,
            warnings=unified['warnings'],
            total_processing_time_ms=unified['total_processing_time_ms']
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
    import threading
    from grpc_health.v1 import health
    from grpc_health.v1 import health_pb2, health_pb2_grpc
    from rest_server import run_rest_server

    svc = VideoAnalysisService()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(svc, server)

    # Health check 추가
    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port("[::]:50054")
    logger.info("🚀 gRPC Server started on :50054")
    server.start()

    # REST 서버 백그라운드 스레드로 실행
    rest_thread = threading.Thread(target=run_rest_server, args=(svc,), daemon=True)
    rest_thread.start()

    server.wait_for_termination()

if __name__ == "__main__":
    serve()
