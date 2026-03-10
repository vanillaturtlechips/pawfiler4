#!/usr/bin/env python3
"""로컬 테스트 클라이언트"""
import grpc
import sys
import os
from pathlib import Path

# Proto 생성 (임시)
sys.path.insert(0, str(Path(__file__).parent / "generated"))

try:
    from generated import video_analysis_pb2, video_analysis_pb2_grpc
except ImportError:
    print("⚠️  Proto 파일 생성 필요")
    print("실행: python -m grpc_tools.protoc -I../../proto --python_out=./generated --grpc_python_out=./generated ../../proto/video_analysis.proto")
    sys.exit(1)


def upload_video(video_path: str, server_address="localhost:50054"):
    """비디오 업로드 및 분석"""
    
    if not os.path.exists(video_path):
        print(f"❌ 파일 없음: {video_path}")
        return
    
    print(f"📤 Uploading: {video_path}")
    print(f"🔗 Server: {server_address}")
    
    channel = grpc.insecure_channel(server_address)
    stub = video_analysis_pb2_grpc.VideoAnalysisServiceStub(channel)
    
    # 메타데이터 + 청크 스트리밍
    def request_generator():
        # 메타데이터
        metadata = video_analysis_pb2.VideoMetadata(
            filename=os.path.basename(video_path),
            user_id="test_user",
            file_size=os.path.getsize(video_path)
        )
        yield video_analysis_pb2.UploadVideoRequest(metadata=metadata)
        
        # 청크 (1MB씩)
        chunk_size = 1024 * 1024
        with open(video_path, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield video_analysis_pb2.UploadVideoRequest(chunk=chunk)
    
    try:
        response = stub.UploadVideo(request_generator())
        task_id = response.task_id
        print(f"✅ Uploaded! Task ID: {task_id}")
        
        # 분석 상태 폴링
        print("\n⏳ Analyzing...")
        import time
        while True:
            status_req = video_analysis_pb2.GetAnalysisStatusRequest(task_id=task_id)
            status = stub.GetAnalysisStatus(status_req)
            
            print(f"   Stage: {status.stage}")
            if status.logs:
                for log in status.logs[-3:]:  # 최근 3개
                    print(f"   [{log.type}] {log.message}")
            
            if status.stage in ["COMPLETED", "ERROR"]:
                break
            
            time.sleep(2)
        
        # 결과 조회
        if status.stage == "COMPLETED":
            print("\n📊 Analysis Result:")
            result_req = video_analysis_pb2.GetAnalysisResultRequest(task_id=task_id)
            result = stub.GetAnalysisResult(result_req)
            
            print(f"   Verdict: {result.verdict.upper()}")
            print(f"   Confidence: {result.confidence_score:.2%}")
            print(f"   Frames analyzed: {result.frame_samples_analyzed}")
            print(f"   Processing time: {result.processing_time_ms}ms")
            print(f"   Model version: {result.model_version}")
        else:
            print("\n❌ Analysis failed")
    
    except grpc.RpcError as e:
        print(f"❌ gRPC Error: {e.code()} - {e.details()}")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_client.py <video_path>")
        print("Example: python test_client.py /media/user/.../celeb_df/fake_0.mp4")
        sys.exit(1)
    
    video_path = sys.argv[1]
    upload_video(video_path)
