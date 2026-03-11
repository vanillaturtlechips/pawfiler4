from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import uuid
import os
import grpc
from generated import video_analysis_pb2, video_analysis_pb2_grpc

app = Flask(__name__)
CORS(app)

s3_client = boto3.client('s3', region_name='ap-northeast-2')
S3_BUCKET = os.getenv('S3_BUCKET', 'pawfiler-videos')

@app.route('/upload-video', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400
    
    video = request.files['video']
    user_id = request.form.get('user_id', '')
    
    key = f"uploads/{user_id}/{uuid.uuid4()}-{video.filename}"
    
    try:
        s3_client.upload_fileobj(
            video,
            S3_BUCKET,
            key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )
        
        video_url = f"https://{S3_BUCKET}.s3.ap-northeast-2.amazonaws.com/{key}"
        
        # Start analysis via gRPC
        channel = grpc.insecure_channel('localhost:50054')
        stub = video_analysis_pb2_grpc.VideoAnalysisServiceStub(channel)
        response = stub.AnalyzeVideo(video_analysis_pb2.AnalyzeVideoRequest(
            video_url=video_url,
            user_id=user_id
        ))
        
        return jsonify({
            'taskId': response.task_id,
            'videoUrl': video_url,
            'verdict': response.verdict,
            'message': response.message
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
