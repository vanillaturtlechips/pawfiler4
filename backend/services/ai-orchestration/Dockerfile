# =================================================================
# PawFiler AI — Slim Docker Image (~2.5GB)
# =================================================================
# 핵심 원칙: 이미지에는 코드만, 모델 가중치는 EFS에서 런타임 마운트
# → Cold Start: 이미지 pull ~30초 + 모델 로드 ~15초 = ~45초
# (모델을 이미지에 구울 경우 18GB → pull만 3~5분)
# =================================================================

FROM rayproject/ray:2.41.0-gpu

# 시스템 의존성
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 의존성
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드
COPY *.py .
COPY serve_config.yaml .

EXPOSE 8000 9090 8265

VOLUME ["/mnt/efs/models"]

# KubeRay가 CMD를 override하므로 placeholder
CMD ["bash", "-c", "sleep infinity"]
