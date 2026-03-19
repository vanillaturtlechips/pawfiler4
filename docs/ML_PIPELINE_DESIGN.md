# AI 생성 영상 판별 ML 파이프라인 설계

> 작성일: 2026-03-15

---

## 1. 문제 정의 및 범주

### 문제 유형: 지도학습 다중 분류 (Supervised Multi-class Classification)

```
입력: 영상/음성 프레임 → 출력: [real | ai_generated | deepfake]
```

| 데이터셋 | 레이블 | 유형 |
|---|---|---|
| aigvdbench/ | `ai_generated` (Sora, Gen2 등 모델명) | 영상 |
| celeb-df/ | `real` / `fake` | 영상 |
| wilddeepfake/ | `real` / `fake` | 영상 |
| dfadd/ | `0(real)` / `1(fake)` | 음성 |

**왜 분류인가?**
- 회귀 제외: 연속값 예측이 아님
- 클러스터링 제외: 레이블이 이미 존재
- 비지도 제외: ground truth 있음

**최적화 목표:**
- 1차: Recall 최대화 (AI 생성 영상을 real로 놓치는 게 더 위험)
- 2차: F1-score (precision/recall 균형)
- 3차: Inference latency < 200ms (실시간 영상 분석 응답성)

---

## 2. 데이터 파이프라인

### 데이터 소스 및 저장 전략

```
S3 ai-preprocessing/preprocessed/
    ├── aigvdbench/{model_name}/{vid}.npz  → frames(N,224,224,3), label=model_name
    ├── celeb-df/{split}/{vid}.npz         → frames(N,224,224,3), label=real|fake
    ├── wilddeepfake/{vid}.npz             → frames(N,224,224,3), label=real|fake
    └── dfadd/{vid}.npz                    → frames(224,224), label=0|1  ← mel-spectrogram
```

**벡터 DB 필요 여부:**

| 용도 | 필요? | 이유 |
|---|---|---|
| 학습 데이터 저장 | ❌ | S3 + .npz로 충분 |
| 피처 임베딩 검색 | ✅ | 유사 영상 검색, 능동 학습 |
| 모델 서빙 캐시 | ✅ | 동일 영상 재분석 방지 |

벡터 DB는 학습 단계보다 **서빙 단계**에서 필요. 현재는 S3 직접 접근으로 충분.

---

## 3. 피처 엔지니어링

### 영상 (aigvdbench, celeb-df, wilddeepfake)

```python
# 각 .npz에서 frames shape: (N, 224, 224, 3)

# 1. 공간 피처 (per-frame)
- DCT 계수 (JPEG 압축 아티팩트 탐지)
- 얼굴 랜드마크 일관성 (프레임 간 변화량)
- 색상 히스토그램 (GAN 특유의 색상 분포)
- 고주파 성분 (Laplacian variance) ← GAN은 고주파 약함

# 2. 시간 피처 (inter-frame)
- 광학 흐름 (Optical Flow) 불연속성
- 프레임 간 픽셀 차이 통계 (mean, std)
- 눈 깜빡임 패턴 (deepfake는 비정상적)

# 3. 정규화
- L2 정규화 (픽셀값 0~1)
- 채널별 Z-score (ImageNet mean/std)
```

### 음성 (dfadd)

```python
# .npz에서 frames shape: (224, 224) ← mel-spectrogram

# 피처
- Mel-spectrogram 통계 (mean, std per band)
- MFCC 계수 (13~40개)
- 스펙트럼 평탄도 (TTS는 너무 균일)
- 포만트 전이 자연스러움

# 정규화
- mel-db 값 min-max → [0, 1]
```

### L1 정규화 기반 피처 선택

```python
from sklearn.linear_model import LogisticRegression
from sklearn.feature_selection import SelectFromModel

# L1 페널티로 불필요한 피처 0으로 수렴
selector = LogisticRegression(penalty='l1', solver='liblinear', C=0.1)
selector.fit(X_train, y_train)
important_features = SelectFromModel(selector, prefit=True)
X_reduced = important_features.transform(X_train)
```

---

## 4. 알고리즘 트레이드오프

### 현재 경량화 모델 맥락에서

| 알고리즘 | 정확도 | 속도 | 해석가능성 | 딥페이크 적합성 | 추천 |
|---|---|---|---|---|---|
| 로지스틱 회귀 | 낮음 | 매우 빠름 | 높음 | ❌ 비선형 패턴 못 잡음 | 베이스라인만 |
| 의사결정 트리 | 중간 | 빠름 | 높음 | △ 과적합 위험 | ❌ |
| **랜덤 포레스트** | 높음 | 중간 | 중간 | ✅ 앙상블 강건성 | ✅ 영상 |
| **Gradient Boosting (XGBoost)** | 매우 높음 | 중간 | 중간 | ✅ 피처 중요도 | ✅ 영상 |
| SVM (RBF) | 높음 | 느림 | 낮음 | △ 고차원에서 느림 | △ |
| **신경망 (CNN)** | 최고 | GPU 필요 | 낮음 | ✅ 공간 패턴 | ✅ 메인 |
| 은닉 마르코프 (HMM) | 중간 | 빠름 | 중간 | ✅ 시계열 패턴 | ✅ 음성 |
| 베이지안 네트워크 | 중간 | 빠름 | 높음 | △ 복잡한 의존성 | △ |
| 베이지안 로지스틱 회귀 | 중간 | 빠름 | 높음 | △ 불확실성 정량화 | △ |
| **GMM** | 중간 | 빠름 | 중간 | ✅ 이상치 탐지 | ✅ 보조 |
| K-평균 | 낮음 | 빠름 | 중간 | ❌ 비지도 | 전처리만 |
| **PCA** | - | 빠름 | 중간 | ✅ 차원 축소 | ✅ 전처리 |

### 권장 아키텍처: Cascade 파이프라인

```
입력 영상/음성
    │
    ▼
[1단계] 경량 필터 (XGBoost on hand-crafted features)
    ├── 확실한 real → 즉시 반환 (80% 케이스)
    └── 불확실 → 2단계
         │
         ▼
    [2단계] CNN (EfficientNet-B0 or MobileNetV3)
         ├── 확실한 fake → 반환
         └── 불확실 → 3단계
              │
              ▼
         [3단계] 앙상블 (CNN + HMM for temporal)
```

이게 README에 언급된 "ML Cascade 파이프라인 (비용 69% 절감)"의 근거.

---

## 5. 3-에이전트 분할 설계

### 레이블별 전문 에이전트

```
┌─────────────────────────────────────────────────────┐
│                  Orchestrator Agent                  │
│         (입력 라우팅 + 결과 앙상블 + 신뢰도 계산)        │
└──────────┬──────────────┬──────────────┬────────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐
    │ Video Agent │ │Audio Agent │ │ Real Agent  │
    │ (영상 딥페이크)│ │(음성 합성) │ │(진짜 판별)  │
    │             │ │            │ │             │
    │ - CNN       │ │ - HMM      │ │ - GMM       │
    │ - XGBoost   │ │ - MFCC     │ │ - Isolation │
    │ - Optical   │ │ - Mel-spec │ │   Forest    │
    │   Flow      │ │            │ │             │
    └─────────────┘ └────────────┘ └─────────────┘
```

**오케스트레이터 로직:**
```python
def orchestrate(input_data):
    modality = detect_modality(input_data)  # video/audio/both

    results = {}
    if modality in ['video', 'both']:
        results['video'] = video_agent.predict(input_data)
    if modality in ['audio', 'both']:
        results['audio'] = audio_agent.predict(input_data)

    # 신뢰도 가중 앙상블
    final = weighted_ensemble(results, weights={'video': 0.7, 'audio': 0.3})
    return final
```

---

## 6. 학습, 평가, 교차검증

### 데이터 분할 전략

```python
# 데이터 불균형 주의: aigvdbench 478k >> celeb-df 6.5k
# → Stratified K-Fold + 클래스 가중치

from sklearn.model_selection import StratifiedKFold

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
    # 각 fold에서 클래스 비율 유지
    X_train, X_val = X[train_idx], X[val_idx]
    y_train, y_val = y[train_idx], y[val_idx]

    model.fit(X_train, y_train, class_weight='balanced')
    evaluate(model, X_val, y_val)
```

### 평가 지표

```python
from sklearn.metrics import classification_report, roc_auc_score

metrics = {
    'recall_fake': recall_score(y_true, y_pred, pos_label='fake'),  # 최우선
    'f1_macro': f1_score(y_true, y_pred, average='macro'),
    'auc_roc': roc_auc_score(y_true, y_prob, multi_class='ovr'),
    'inference_ms': measure_latency(model, sample_input),
}
```

---

## 7. AWS 최적화

### 학습 단계

| AWS 서비스 | 용도 | 비용 최적화 |
|---|---|---|
| **SageMaker Training** | 분산 학습 | Spot 인스턴스 (70% 절감) |
| **S3** | 데이터 소스 | S3 Transfer Acceleration |
| **ECR** | 학습 컨테이너 | 이미 구성됨 |
| **EKS + Karpenter** | 학습 워크로드 | Spot + On-demand 혼합 |

### 분산 학습 (Hadoop MapReduce 대안)

Hadoop MapReduce는 ML에 비효율적. 대신:

```
SageMaker Distributed Training
    ├── Data Parallel: 큰 데이터셋 (aigvdbench 478k)
    │   └── AllReduce (NCCL) - GPU 간 그래디언트 동기화
    └── Model Parallel: 큰 모델
        └── Pipeline Parallelism

또는 현재 EKS 환경에서:
    Ray on EKS → 분산 하이퍼파라미터 튜닝
    Spark on EMR → 피처 엔지니어링 (대용량 전처리)
```

### 서빙 단계

```
CloudFront → ALB → Envoy → Video Analysis Service (현재 구조)
                              │
                              ├── [경량] EKS Pod (XGBoost)
                              │    └── 응답 < 50ms
                              └── [중량] SageMaker Endpoint
                                   └── CNN 추론, GPU
```

### SageMaker 파이프라인 구성

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.steps import TrainingStep, ProcessingStep

pipeline = Pipeline(
    name="deepfake-detection",
    steps=[
        ProcessingStep(name="feature-engineering"),  # S3 → 피처 추출
        TrainingStep(name="train-xgboost"),           # 경량 모델
        TrainingStep(name="train-cnn"),               # 중량 모델
        # ModelStep → 평가 → 조건부 배포
    ]
)
```

---

## 8. 모델 수명 주기 (MLOps)

### 전체 흐름

```
데이터 수집 → 전처리(완료) → 피처 엔지니어링 → 학습 → 평가
     ↑                                                    │
     └──────────── 재학습 트리거 ←── 모니터링 ←── 배포 ←──┘
```

### 재학습 트리거 조건
- 모델 정확도 < 임계값 (예: F1 < 0.85)
- 새 딥페이크 기술 등장 (데이터 드리프트 감지)
- 주기적 (월 1회)

### 디버깅 방법

```python
# 1. 데이터 문제 확인
assert X_train.shape[1] == X_val.shape[1], "피처 차원 불일치"
print(pd.Series(y_train).value_counts())  # 클래스 불균형 확인

# 2. 학습 곡선으로 과적합/과소적합 진단
plot_learning_curve(model, X_train, y_train)
# - train/val 격차 큼 → 과적합 → 정규화 강화, 데이터 증강
# - 둘 다 낮음 → 과소적합 → 모델 복잡도 증가

# 3. SHAP으로 피처 중요도 해석
import shap
explainer = shap.TreeExplainer(xgb_model)
shap_values = explainer.shap_values(X_val)
shap.summary_plot(shap_values, X_val)

# 4. Confusion Matrix로 오분류 패턴 파악
# → 어떤 모델(Sora vs Gen2)을 헷갈리는지 확인
```

### CI/CD 배포 파이프라인

```yaml
# .github/workflows/ci-cd.yml 확장
on:
  push:
    paths: ['backend/services/video-analysis/**']

jobs:
  train-and-deploy:
    steps:
      - name: Run unit tests
      - name: Feature validation (Great Expectations)
      - name: Trigger SageMaker Pipeline
      - name: A/B test (10% 트래픽 → 새 모델)
      - name: Canary 배포 (CloudWatch 지표 정상 시 100%)
      - name: Rollback if F1 drops > 5%
```

---

## 9. 다른 제품과 결합 (TODO)

> ⚠️ 이 섹션은 추후 작성 예정

현재 아키텍처 확장:
```
클라이언트 (Go gRPC)
    └── video_analysis.proto 호출
         └── Video Analysis Service (Python)
              ├── [현재] cascade_detector.py
              └── [추가] agent_orchestrator.py
                   ├── VideoAgent.predict()
                   ├── AudioAgent.predict()
                   └── RealAgent.predict()
```

외부 연동 예정:
- AWS Rekognition: 얼굴 탐지 전처리 보조
- AWS Comprehend: 텍스트 딥페이크 (미래)
- SageMaker Model Registry: 모델 버전 관리
- MLflow (EKS 배포): 실험 추적

---

## 우선순위 로드맵

1. **즉시** - XGBoost + hand-crafted features로 베이스라인 구축 (celeb-df + wilddeepfake)
2. **단기** - EfficientNet-B0 파인튜닝 (aigvdbench 활용)
3. **중기** - HMM 음성 에이전트 추가 (dfadd)
4. **장기** - 3-에이전트 오케스트레이터 + SageMaker 파이프라인 자동화
