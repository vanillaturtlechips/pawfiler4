# PawFiler AI — Ray Serve 딥페이크 탐지 시스템

> AI 생성 영상 탐지를 위한 멀티 에이전트 추론 서버

## 아키텍처 요약

```
POST /analyze
     │
     ▼
Orchestrator (Ingress)
     │
     ├─ XGBoost Cascade Gate ──→ ~80% 즉시 반환 (50ms)
     │
     └─ [불확실 20%] Fan-out (Plasma Zero-Copy)
            ├─ VideoAgent ─→ SharedModelWorker (GPU)
            ├─ AudioAgent ─→ SharedModelWorker (GPU)
            └─ SyncAgent  ─→ SharedModelWorker (GPU)
                    │
                    └─ Fan-in → FusionAgent → 최종 판단
```

## 프로젝트 구조

```
pawfiler_serve/
├── app.py                 # Layer 3: Orchestrator + Deployment Graph 조립
├── models.py              # Layer 1: SharedModelWorker (GPU 싱글톤)
├── agents.py              # Layer 2: Video/Audio/Sync/Fusion 에이전트
├── cascade.py             # XGBoost Cascade Gate (경량 1단계)
├── metrics.py             # Layer 4: Prometheus 커스텀 메트릭
├── serve_config.yaml      # Ray Serve 배포 설정
├── requirements.txt       # Python 의존성
├── Dockerfile             # Slim 이미지 (코드만, 모델 가중치 없음)
├── k8s/
│   └── rayservice.yaml    # EKS + KubeRay 배포 매니페스트
└── README.md
```

## 레이어 구조

| Layer | 파일 | 역할 | GPU |
|-------|------|------|-----|
| 1 | `models.py` | EFS → VRAM 모델 로드 (싱글톤) | ✅ 1장 |
| 2 | `agents.py` | 논리적 에이전트 (전처리/후처리) | ❌ |
| 2 | `cascade.py` | XGBoost 경량 필터 | ❌ |
| 3 | `app.py` | HTTP Ingress + DAG 오케스트레이션 | ❌ |
| 4 | `metrics.py` | Prometheus 메트릭 수집 | ❌ |

## 로컬 개발

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 모델 디렉토리 준비 (없으면 랜덤 초기화로 동작)
mkdir -p /mnt/efs/models

# 3. 실행
serve run app:deployment_graph --host 0.0.0.0 --port 8000

# 4. 테스트
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"media_url": "s3://bucket/sample.mp4", "modality": "both"}'
```

## EKS 배포

```bash
# 선행: EKS + KubeRay Operator + EFS CSI Driver 구성 완료

# 1. Docker 이미지 빌드 & push
docker build -t pawfiler-serve .
docker tag pawfiler-serve:latest <ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/pawfiler-serve:latest
docker push <ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/pawfiler-serve:latest

# 2. 모델 가중치를 EFS에 업로드
aws s3 cp s3://pawfiler-models/ /mnt/efs/models/ --recursive

# 3. KubeRay 배포
kubectl apply -f k8s/rayservice.yaml

# 4. 상태 확인
kubectl get rayservice -n pawfiler
kubectl port-forward svc/pawfiler-serve-head-svc 8265:8265 -n pawfiler  # Dashboard
```

## 설계 결정 근거

자세한 의사결정 과정은 `ML_AI_ORCHESTRATION.md §12`를 참조하세요.

- **BYOC (Bring Your Own Container)**: AWS SageMaker 종속 없이 어디서든 동일 동작
- **EFS 마운트**: Docker 이미지 2.5GB (가중치 분리), Cold Start ~45초
- **Cascade Gate**: ~80% 요청을 XGBoost로 즉시 처리 → GPU 비용 69% 절감
- **Plasma Zero-Copy**: 에이전트 간 텐서 복사 없음 → 네트워크 오버헤드 0
