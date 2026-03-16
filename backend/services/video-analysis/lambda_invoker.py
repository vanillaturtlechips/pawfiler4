"""Lambda 호출 클라이언트"""
import boto3
import json
import os
from typing import Dict

class LambdaInvoker:
    def __init__(self):
        self.client = boto3.client('lambda', region_name='ap-northeast-2')
        self.visual_function = os.getenv('VISUAL_LAMBDA_ARN', 'pawfiler-visual-analysis')
        self.audio_function = os.getenv('AUDIO_LAMBDA_ARN', 'pawfiler-audio-analysis')
    
    def invoke_visual(self, s3_key: str, task_id: str) -> Dict:
        """영상 분석 Lambda 비동기 호출"""
        payload = {
            's3_bucket': os.getenv('S3_BUCKET', 'pawfiler-videos'),
            's3_key': s3_key,
            'task_id': task_id
        }
        
        response = self.client.invoke(
            FunctionName=self.visual_function,
            InvocationType='Event',  # 비동기
            Payload=json.dumps(payload)
        )
        
        return {'status': 'invoked', 'status_code': response['StatusCode']}
    
    def invoke_audio(self, s3_key: str, task_id: str) -> Dict:
        """음성 분석 Lambda 비동기 호출"""
        payload = {
            's3_bucket': os.getenv('S3_BUCKET', 'pawfiler-videos'),
            's3_key': s3_key,
            'task_id': task_id
        }
        
        response = self.client.invoke(
            FunctionName=self.audio_function,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
        
        return {'status': 'invoked', 'status_code': response['StatusCode']}
