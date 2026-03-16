# 영상 분석 멀티모달 시스템 구현 완료

## 개요

사용자가 영상을 업로드하면 자동으로:
1. 영상 분석 (딥페이크 탐지 + AI 모델 식별)
2. 음성 분석 (오디오 있을 때만)
3. 결과 통합 (가중치 기반 최종 판정)

## 아키텍처

```
[사용자] → [EKS gRPC] → [S3] → [Lambda (병렬)]
                                    ↓
                            [Visual + Audio]
                                    ↓
                            [ResultAggregator]
                                    ↓
                            [UnifiedReport]
```

## 구현 완료 항목

### 백엔드

#### 1. Proto 확장 (`backend/proto/video_analysis.proto`)
- `UnifiedReport` - 통합 결과
- `VisualAnalysis` - 영상 분석 (AI 모델 식별 포함)
- `AudioAnalysis` - 음성 분석
- `SyncAnalysis` - 립싱크 (구조만)
- `GetUnifiedResult` RPC 추가

#### 2. 오케스트레이션 모듈
- `media_inspector.py` - ffprobe로 메타데이터 검사 (오디오 유무)
- `lambda_invoker.py` - Lambda 비동기 호출
- `result_aggregator.py` - 가중치 기반 결과 통합
- `server.py` - 멀티모달 분석 플로우

#### 3. Lambda 함수
- `lambdas/visual_lambda.py` - 영상 딥페이크 탐지
- `lambdas/audio_lambda.py` - 음성 합성 탐지
- `lambdas/Dockerfile.visual` - Visual Lambda 이미지
- `lambdas/Dockerfile.audio` - Audio Lambda 이미지
- `lambdas/deploy.sh` - 배포 스크립트

### 프론트엔드

#### 1. 타입 정의 (`frontend/src/lib/types.ts`)
- `UnifiedReport` - 통합 결과
- `VisualAnalysis` - 영상 분석
- `AudioAnalysis` - 음성 분석
- `AIModelPrediction` - AI 모델 식별
- `FrameScore` - 프레임별 점수

#### 2. API 함수 (`frontend/src/lib/api.ts`)
- `getUnifiedResult()` - 통합 결과 조회

#### 3. UI 컴포넌트
- `AIModelCard.tsx` - AI 모델 식별 카드 (Sora 87% 등)
- `AudioPanel.tsx` - 음성 분석 패널
- `FrameTimeline.tsx` - 프레임별 점수 타임라인

#### 4. 페이지 업데이트 (`AnalysisPage.tsx`)
- UnifiedReport 사용
- 조건부 렌더링 (오디오 있을 때만 AudioPanel 표시)
- 경고 메시지 표시

## 주요 기능

### 1. 자동 멀티모달 분석
- 오디오 있으면 → 영상 + 음성 동시 분석
- 오디오 없으면 → 영상만 분석
- 사용자는 카테고리 선택 불필요

### 2. AI 모델 식별
- 23개 AI 생성 모델 분류 (Sora, Runway, Pika 등)
- 상위 3개 후보 표시
- 신뢰도 점수

### 3. 음성 합성 탐지
- TTS / Voice Clone / Real Voice 판별
- 구간별 합성 점수
- 신뢰도 표시

### 4. 프레임별 분석
- 타임라인 시각화
- 의심 구간 하이라이트
- 클릭 시 상세 정보 (TODO)

### 5. 통합 판정
- 가중치: 영상 70% + 음성 30%
- REAL / FAKE / UNCERTAIN
- 최종 신뢰도 점수

## 사용 방법

### 사용자 플로우

1. **업로드**
   - 드래그앤드롭 또는 파일 선택
   - URL 입력 가능

2. **분석 진행**
   - 업로드 중 (진행률 표시)
   - 분석 중 (단계별 로그)

3. **결과 확인**
   - 최종 판정 (큰 이모지 + 점수)
   - AI 모델 식별 카드
   - 음성 분석 패널 (있으면)
   - 프레임 타임라인
   - 경고 메시지

### 개발자 플로우

#### 백엔드 배포

```bash
# 1. Lambda 이미지 빌드 & 푸시
cd backend/services/video-analysis
./lambdas/deploy.sh

# 2. Lambda 함수 생성 (AWS Console 또는 Terraform)
# 3. EKS 환경변수 설정
kubectl apply -f k8s/video-analysis-configmap.yaml
kubectl rollout restart deployment/video-analysis -n pawfiler
```

#### 프론트엔드 배포

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://pawfiler-frontend --delete
aws cloudfront create-invalidation --distribution-id E1YU8EA9X822Q1 --paths "/*"
```

## 파일 구조

```
backend/services/video-analysis/
├── server.py                    # gRPC 서버 (오케스트레이션)
├── media_inspector.py           # 메타데이터 검사
├── lambda_invoker.py            # Lambda 호출
├── result_aggregator.py         # 결과 통합
├── local_detector.py            # 로컬 딥페이크 탐지
├── audio_deepfake_detector.py   # 음성 탐지
└── lambdas/
    ├── visual_lambda.py         # Visual Lambda 핸들러
    ├── audio_lambda.py          # Audio Lambda 핸들러
    ├── Dockerfile.visual        # Visual 이미지
    ├── Dockerfile.audio         # Audio 이미지
    └── deploy.sh                # 배포 스크립트

frontend/src/
├── lib/
│   ├── types.ts                 # UnifiedReport 타입
│   └── api.ts                   # getUnifiedResult()
├── components/
│   ├── AIModelCard.tsx          # AI 모델 카드
│   ├── AudioPanel.tsx           # 음성 패널
│   └── FrameTimeline.tsx        # 타임라인
└── pages/
    └── AnalysisPage.tsx         # 분석 페이지

docs/
└── LAMBDA_DEPLOYMENT.md         # 배포 가이드
```

## 다음 단계

### 필수
1. ✅ Lambda 배포
2. ✅ 테스트 (오디오 있는/없는 영상)
3. ⬜ RDS 연동 (Lambda 결과 저장)

### 선택
4. ⬜ 립싱크 분석 (SyncAgent)
5. ⬜ SQS 큐 추가 (재시도 자동화)
6. ⬜ Step Functions (복잡한 워크플로우)
7. ⬜ 프레임 클릭 시 상세 정보

## 비용 예상

- **Lambda**: ~$23/월 (1000건 기준)
- **S3**: ~$1/월 (100GB 저장)
- **RDS**: ~$15/월 (db.t3.micro)
- **총**: ~$39/월

무료 티어 활용 시 거의 무료 가능.

## 참고 문서

- [LAMBDA_DEPLOYMENT.md](./LAMBDA_DEPLOYMENT.md) - Lambda 배포 가이드
- [ML_STRATEGY.md](../.kiro/ML_STRATEGY.md) - ML 전략
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 전체 아키텍처
