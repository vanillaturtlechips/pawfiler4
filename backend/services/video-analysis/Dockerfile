FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir timm==0.9.12

# gRPC health probe
RUN wget -qO /bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.24/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

# Proto 먼저 복사
COPY proto ./proto

# Proto 생성
RUN mkdir -p generated && \
    touch generated/__init__.py && \
    python -m grpc_tools.protoc -I./proto --python_out=./generated --grpc_python_out=./generated ./proto/video_analysis.proto && \
    sed -i 's/^import video_analysis_pb2/from . import video_analysis_pb2/' generated/video_analysis_pb2_grpc.py

# 나머지 코드 복사
COPY . .

EXPOSE 50054 8080

ENV PYTHONPATH=/app

# Start both servers
CMD python upload.py & python server.py
