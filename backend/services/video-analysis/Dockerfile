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

# Proto 먼저 복사 (미리 생성된 파일 사용)
COPY proto ./proto
COPY generated ./generated

# 나머지 코드 복사
COPY . .

EXPOSE 50054 8080

ENV PYTHONPATH=/app

# Start both servers
CMD python upload.py & python server.py
