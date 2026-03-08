FROM python:3.11-slim

WORKDIR /app

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# gRPC health probe
RUN wget -qO /bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.24/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

# 코드 복사
COPY . .

# Proto 생성 (빌드 시)
RUN python -m grpc_tools.protoc -I../../proto --python_out=./generated --grpc_python_out=./generated ../../proto/video_analysis.proto

EXPOSE 50054

CMD ["python", "server.py"]
