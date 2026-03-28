FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치 (비디오 서빙용 최소)
RUN apt-get update && apt-get install -y \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# gRPC health probe
RUN wget -qO /bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.24/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

# Proto 복사 후 gRPC 코드 생성
COPY proto ./proto
RUN mkdir -p generated && \
    python -m grpc_tools.protoc \
        -I./proto \
        --python_out=./generated \
        --grpc_python_out=./generated \
        proto/*.proto && \
    touch generated/__init__.py && \
    sed -i 's/import video_analysis_pb2/from generated import video_analysis_pb2/' generated/video_analysis_pb2_grpc.py

# 나머지 코드 복사
COPY . .

EXPOSE 50054 8080

ENV PYTHONPATH=/app

# Start both servers
CMD python upload.py & python server.py
