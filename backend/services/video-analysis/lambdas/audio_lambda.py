"""Audio Analysis Lambda Handler"""
import json
import boto3
import os
import sys

sys.path.insert(0, '/opt/python')

s3 = boto3.client('s3')

def handler(event, context):
    """
    Lambda 핸들러
    event: {
        's3_bucket': 'pawfiler-videos',
        's3_key': 'analysis/task-id.mp4',
        'task_id': 'uuid'
    }
    """
    bucket = event['s3_bucket']
    key = event['s3_key']
    task_id = event['task_id']
    
    # 1. S3에서 다운로드
    local_path = f'/tmp/{task_id}.mp4'
    s3.download_file(bucket, key, local_path)
    
    # 2. 오디오 추출
    audio_path = f'/tmp/{task_id}.wav'
    import subprocess
    subprocess.run([
        'ffmpeg', '-i', local_path,
        '-vn', '-acodec', 'pcm_s16le',
        '-ar', '16000', '-ac', '1',
        audio_path
    ], check=True)
    
    # 3. 분석 실행
    from audio_deepfake_detector import AudioDeepfakeDetector
    detector = AudioDeepfakeDetector()
    result = detector.detect(audio_path)
    
    # 4. 결과 저장 (RDS or DynamoDB)
    # TODO: DB 저장 로직
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'task_id': task_id,
            'result': result
        })
    }
