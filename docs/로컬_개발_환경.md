# PawFiler 개발 가이드

마지막 업데이트: 2026-03-09

## 목차
- [로컬 개발 환경](#로컬-개발-환경)
- [GitHub Actions 설정](#github-actions-설정)
- [ML 파이프라인](#ml-파이프라인)
- [테스트](#테스트)

---

## 로컬 개발 환경

### 1. 사전 준비
```bash
# Node.js 18+
node --version

# Go 1.21+
go version

# Python 3.11+
python3 --version

# Docker & Docker Compose
docker --version
docker-compose --version
```

### 2. 백엔드 시작
```bash
cd backend
docker-compose up -d

# 서비스 확인
docker-compose ps
```

**실행되는 서비스:**
- PostgreSQL (5432)
- Quiz Service (50052)
- Community Service (50053)
- Admin Service (8082)
- Envoy Proxy (8080)

### 3. 프론트엔드 시작
```bash
# 사용자 프론트엔드
cd frontend
npm install
npm run dev
# http://localhost:5173

# 관리자 프론트엔드
cd admin-frontend
npm install
npm run dev
# http://localhost:5174
```

### 4. 환경 변수 설정

#### 프론트엔드 (.env)
```bash
# 로컬 개발
VITE_API_URL=http://localhost:8080
VITE_ADMIN_API_URL=http://localhost:8082
VITE_USE_MOCK_API=false

# 프로덕션
VITE_API_URL=https://api.pawfiler.com
VITE_ADMIN_API_URL=https://admin-api.pawfiler.com
```

#### 백엔드 (docker-compose.yml)
```yaml
environment:
  - DATABASE_URL=postgres://pawfiler:pawfiler@postgres:5432/pawfiler_db
  - DB_HOST=postgres
  - DB_PORT=5432
  - DB_NAME=pawfiler_db
  - DB_USER=pawfiler
  - DB_PASSWORD=pawfiler
```

---

## GitHub Actions 설정

### 1. PAT (Personal Access Token) 생성

#### GitHub PAT
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. 설정:
   - Note: `PawFiler ArgoCD Repo Access`
   - Expiration: 90 days
   - Scopes: `repo`, `workflow`
4. 토큰 복사 (예: `ghp_xxxxxxxxxxxxxxxxxxxx`)

### 2. GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions

| Secret Name | 값 | 용도 |
|-------------|-----|------|
| `AWS_ROLE_ARN` | `arn:aws:iam::009946608368:role/GitHubActionsECRRole` | GitHub Actions AWS 인증 |
| `ECR_REGISTRY` | `009946608368.dkr.ecr.ap-northeast-2.amazonaws.com` | ECR 레지스트리 주소 |
| `ARGOCD_REPO_TOKEN` | `ghp_xxxxx...` | ArgoCD 레포 접근 토큰 |

### 3. AWS OIDC 설정
```bash
cd terraform
terraform apply -target=aws_iam_role.github_actions
```

### 4. CI/CD 워크플로우

#### 자동 배포 흐름
```
코드 변경 → Git Push → GitHub Actions
  ↓
Docker 이미지 빌드 → ECR 푸시
  ↓
ArgoCD 레포 이미지 태그 업데이트
  ↓
ArgoCD 자동 동기화 → EKS 배포
```

#### 수동 배포
```bash
# 이미지 빌드 & 푸시
./scripts/build-and-push.sh

# ArgoCD 레포 업데이트
cd ~/Documents/finalproject/pawfiler4-argocd
# deployment.yaml의 이미지 태그 변경
git push

# ArgoCD가 자동으로 배포
```

---

## ML 파이프라인

### 아키텍처: Cascade 구조 (비용 66% 절감)

```
영상 입력
  ↓
[Tier 1] MobileViT v2 (100% 실행)
  ├─ confidence ≥ 0.85 → 결과 반환 (70%)
  └─ confidence < 0.85 → Tier 2
      ↓
[Tier 2] faster-whisper + silero-vad (30% 실행)
  ├─ 음성 없음 → 결과 반환
  ├─ confidence ≥ 0.75 → 결과 반환 (20%)
  └─ confidence < 0.75 → Tier 3
      ↓
[Tier 3] Nova 2 Lite (10% 실행)
  └─ 최종 판단
```

### 비용 최적화 전략

#### 1. 영상 분석 (MobileViT v2)
- SageMaker Auto-scaling: 0-3 인스턴스
- Scene-aware 샘플링: 98% 프레임 절감
- ONNX 변환: 추론 속도 2-3배 향상

#### 2. 음성 분석 (faster-whisper)
- silero-vad: 무음 구간 제거 (40-60% 절감)
- 음성 비율 20% 미만 시 STT 스킵
- AWS Transcribe 대비 87% 비용 절감

#### 3. LLM (Nova 2 Lite)
- 최소 토큰 프롬프트: 50 토큰
- Thinking OFF
- 10%만 실행

### 비용 시뮬레이션 (100k 요청/월, 60초 영상)

| 컴포넌트 | 실행 비율 | 월 비용 |
|---------|----------|---------|
| MobileViT v2 | 100% | ~$45 |
| faster-whisper | 30% | ~$8 |
| Nova 2 Lite | 10% | ~$3 |
| **합계** | - | **~$56/월** |

**vs 전체 상시 실행**: ~$180/월  
**절감율**: 69%

### 로컬 학습
```bash
cd backend/services/video-analysis/ml
python3 train.py \
  --data-dir /path/to/data \
  --epochs 10 \
  --batch-size 8
```

### SageMaker Spot 학습 (대규모)
```bash
# 데이터 S3 업로드
aws s3 sync /path/to/data s3://pawfiler-ml-artifacts/data/

# Spot 학습 Job (70-90% 절감)
./train_sagemaker.sh
```

### 음성 딥페이크 탐지 추가 (비용 $0)

#### Google Colab 무료 GPU 활용
```python
# colab_audio_deepfake_training.py를 Colab에 복사
# 실행 → audio_deepfake_mobilenet.pth 다운로드
```

#### 모델 배포
```bash
cp audio_deepfake_mobilenet.pth backend/services/video-analysis/ml/models/
pip install librosa scipy
```

**장점:**
- 학습 비용: $0 (Colab 무료)
- 운영 비용: $0 추가 (기존 인프라 재사용)
- 경량: MobileNetV3 (5.4M 파라미터)
- CPU 추론 가능

---

## 테스트

### 백엔드 테스트
```bash
# Quiz Service
cd backend/services/quiz
go test ./...

# Community Service
cd backend/services/community
go test ./...
```

### 프론트엔드 테스트
```bash
cd frontend
npm run test
```

### E2E 테스트
```bash
cd frontend
npm run test:e2e
```

### 로컬 통합 테스트
```bash
# 전체 스택 시작
cd backend && docker-compose up -d
cd frontend && npm run dev

# API 테스트
curl http://localhost:8080/api/quiz.QuizService/GetRandomQuestion \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 코드 스타일

### Go
```bash
# 포맷팅
go fmt ./...

# Lint
golangci-lint run
```

### TypeScript
```bash
# 포맷팅
npm run format

# Lint
npm run lint
```

### Python
```bash
# 포맷팅
black .

# Lint
flake8 .
```

---

## 참고 자료

- [ARCHITECTURE.md](../ARCHITECTURE.md) - 시스템 아키텍처
- [backend/services/quiz/README.md](../backend/services/quiz/README.md) - Quiz Service
- [k8s/README.md](../k8s/README.md) - Kubernetes 가이드
