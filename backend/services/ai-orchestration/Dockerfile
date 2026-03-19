# =================================================================
# PawFiler AI — Slim Docker Image (~2.5GB)
# =================================================================
# 핵심 원칙: 이미지에는 코드만, 모델 가중치는 EFS에서 런타임 마운트
# → Cold Start: 이미지 pull ~30초 + 모델 로드 ~15초 = ~45초
# (모델을 이미지에 구울 경우 18GB → pull만 3~5분)
# =================================================================

FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# 시스템 의존성 (ffmpeg은 영상 전처리 필수)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 의존성 (레이어 캐싱 활용)
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 애플리케이션 코드만 복사 (가중치 없음!)
COPY *.py .
COPY serve_config.yaml .

# Ray Serve 포트
EXPOSE 8000
# Prometheus 메트릭 포트
EXPOSE 9090
# Ray Dashboard
EXPOSE 8265

# Health check (K8s readiness probe)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s \
    CMD python3 -c "import requests; r=requests.get('http://localhost:8000/-/healthz'); r.raise_for_status()"

# 모델 가중치 마운트 포인트 (EFS PersistentVolume)
VOLUME ["/mnt/efs/models"]

# 엔트리포인트: Ray Serve 시작
CMD ["serve", "run", "app:deployment_graph", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--config-file", "serve_config.yaml"]
