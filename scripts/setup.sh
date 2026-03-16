#!/bin/bash
# EC2 인스턴스 초기 설정 (user-data)

set -e

cd /home/ubuntu

# 의존성 설치
pip install s3fs opencv-python-headless tqdm numpy

# 전처리 스크립트 다운로드
aws s3 cp s3://pawfiler-terraform-state/preprocess_s3.py . || echo "Upload script first"

# 실행
nohup python3 preprocess_s3.py > /tmp/preprocess.log 2>&1 &

echo "Preprocessing started. Check /tmp/preprocess.log"
