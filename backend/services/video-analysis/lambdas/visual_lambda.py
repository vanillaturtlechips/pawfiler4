"""Visual Analysis Lambda Handler"""
import json
import boto3
import os
import sys
from pathlib import Path

# Lambda Layer에서 모델 로드
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
    
    # 2. 분석 실행
    from local_detector import LocalDeepfakeDetector
    detector = LocalDeepfakeDetector()
    
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(detector.analyze(local_path))
    loop.close()
    
    # 3. 결과 저장 (RDS or DynamoDB)
    # TODO: DB 저장 로직
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'task_id': task_id,
            'result': result
        })
    }
