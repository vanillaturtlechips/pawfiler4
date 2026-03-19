# PawFiler AI 오케스트레이션 설계

> AI 생성 영상 탐지 시스템의 멀티 에이전트 아키텍처 및 ML 파이프라인 통합 문서
> 작성일: 2026-03-19

---

## 1. 문제 정의

**목표:** "이 영상은 Sora로 만들어졌습니다 (87%)" — 설명 가능한 AI 탐지 시스템

| 항목 | 내용 |
|---|---|
| 분류 유형 | 지도학습 다중 분류 (35클래스) |
| 입력 | 영상 프레임 + 음성 |
| 출력 | AI 모델명 / real / fake / audio_fake |
| 최적화 1순위 | Recall 최대화 (AI 생성 영상을 real로 놓치는 게 더 위험) |
| 최적화 2순위 | F1-score (macro) ≥ 0.90 (SLO 목표) |
| 최적화 3순위 | Inference latency < 200ms |

---

## 2. 데이터셋

| 데이터셋 | 레이블 | 규모 | 용도 |
|---|---|---|---|
| AIGVDBench | AI 모델명 (Sora, Gen2 등 23종) | ~478k 영상 | AI 모델 식별 |
| Celeb-DF | real / fake | ~6.5k 영상 | 얼굴 합성 탐지 |
| WildDeepfake | real / fake | 실제 인터넷 수집 | 실전 적응 |
| DFADD | 0(real) / 1(fake) | 음성 mel-spectrogram | 음성 합성 탐지 |

**클래스 불균형 대응:** FocalLoss + Label Smoothing 0.1, Stratified K-Fold

---

## 3. 멀티 에이전트 아키텍처

```
입력 영상/음성
        │
        ▼
┌───────────────────────────────────────────────────┐
│               Orchestrator Agent                  │
│      (입력 라우팅 + 결과 앙상블 + 신뢰도 계산)        │
└──────────┬──────────────┬──────────────┬──────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
    │ Video Agent │ │Audio Agent │ │  Sync Agent   │
    │             │ │            │ │               │
    │ Backbone    │ │ Wav2Vec2   │ │  SyncNet      │
    │ + LSTM      │ │ + HMM      │ │               │
    │ + XGBoost   │ │ + MFCC     │ │ 립싱크 일치도  │
    └─────────────┘ └────────────┘ └───────────────┘
           │              │              │
           └──────────────┴──────────────┘
                          │
                    ┌─────▼──────┐
                    │Fusion Agent│
                    │(Late Fusion│
                    │+ Cross-attn│
                    └────────────┘
                          │
                          ▼
              종합 판단 + 설명 생성
```

### Orchestrator 로직

```python
def orchestrate(input_data):
    modality = detect_modality(input_data)  # video / audio / both

    results = {}
    if modality in ['video', 'both']:
        results['video'] = video_agent.predict(input_data)
    if modality in ['audio', 'both']:
        results['audio'] = audio_agent.predict(input_data)
    if modality == 'both':
        results['sync'] = sync_agent.predict(input_data)

    return fusion_agent.ensemble(results, weights={'video': 0.7, 'audio': 0.3})
```

---

## 4. 에이전트 서빙 방식: 논리적 에이전트 래핑 (채택)

### 결정 근거

| 방식 | 속도 | 유연성 | 학습 가치 | 결정 |
|---|---|---|---|---|
| 통합 에이전트 (Omni-Agent) | ✅ 최고 | ❌ 낮음 | 하 | 탈락 |
| **논리적 에이전트 래핑** | ✅ 충분 | ✅ 최고 | 최상 | **채택** |

### 구조

무거운 통합 모델은 GPU 메모리에 **단 하나(Shared Worker)** 만 띄워두고, 그 위에 Video / Audio / Sync 독립 API(에이전트) 껍데기를 씌워 오케스트레이터와 비동기로 통신.

```
Orchestrator
    ├── VideoAgent API  ─┐
    ├── AudioAgent API  ─┼──→ Shared Model Worker (GPU, 싱글톤)
    └── SyncAgent API   ─┘
```

- **Ray Serve / BentoML** 기반으로 구현 예정
- 각 에이전트는 자기 할 일만 알면 됨 (완벽한 책임 분리)
- 나중에 특정 모달리티만 새 모델로 교체 시 해당 에이전트 연결선만 교체

### 핵심 구현 포인트

- **싱글톤 패턴**: 모델이 VRAM에 중복으로 올라가지 않도록 공유 메모리 제어
- **비동기 통신**: 오케스트레이터 → 개별 에이전트 → 공유 모델 간 직렬화/역직렬화 최소화
- **DAG 파이프라인**: 복잡한 추론 흐름을 그래프 형태로 구성

---

## 5. 에이전트 코어 설계

### 4-1. Video Agent (핵심)

**아키텍처:**
```python
class VideoAgent(nn.Module):
    def __init__(self, backbone_name):
        self.backbone = create_model(backbone_name, pretrained=True, num_classes=0)
        self.lstm = nn.LSTM(self.backbone.num_features, 256, batch_first=True)
        self.head = nn.Linear(256, NUM_CLASSES)  # 35클래스

    def forward(self, x):  # x: (B, T, C, H, W)
        feats = self.backbone(x.view(B*T, C, H, W)).view(B, T, -1)
        _, (h, _) = self.lstm(feats)
        return self.head(h.squeeze(0))
```

**Backbone 비교 실험 결과 (Step 1, 10% 데이터, 1 epoch):**

| 순위 | Backbone | 배치 | 스텝 | 학습 Acc | Loss | Val F1 |
|---|---|---|---|---|---|---|
| 1위 | MobileViTv2-100 | 64 | 800 | 37.43% | 9.7256 | 0.6457 |
| 2위 | EfficientNet-B4 | 32 | 1400 | 37.67% | 27.0727 | 0.5653 |
| 3위 | ViT-Base-Patch16-224 | 32 | 1400 | 11.87% | 10.1022 | 0.5329 |

> ViT는 Transformer 특성상 워밍업 구간이 길어 1 epoch에서 불리. Step 2 (5 epoch) 결과 후 최종 판단.

**Cascade 파이프라인 (비용 ~69% 절감):**
```
입력 영상
    │
    ▼
[1단계] XGBoost (hand-crafted features)
    ├── 확신도 ≥ threshold → 즉시 반환 (~80% 케이스)
    └── 불확실 → 2단계
         │
         ▼
    [2단계] VideoAgent (Backbone + LSTM)
         └── 최종 분류 (35클래스)
```

**Hand-crafted Features (XGBoost 입력):**
```python
def extract_features(frames):
    lap_var   = convolve(gray, lap_kernel).var()   # 고주파 성분 (GAN은 약함)
    dct_ratio = (dct[:8,:8]**2).sum() / ...        # DCT 저주파 비율
    ch_stats  = [mean, std per channel]            # 색상 통계
    diff      = np.diff(feats, axis=0)
    temporal  = [diff.mean(0), diff.std(0)]        # 프레임 간 변화량
```

### 4-2. Audio Agent

- **Backbone:** Wav2Vec2 (특징 벡터 768차원)
- **시계열:** HMM (음성 패턴 시퀀스 모델링)
- **피처:** MFCC, Mel-spectrogram, 스펙트럼 평탄도, 포만트 전이
- **출력:** real / synthetic + 음성 모델명 (ElevenLabs 등)

### 4-3. Sync Agent

- **Backbone:** SyncNet
- **출력:** 립싱크 일치도 (0~1)

### 4-4. Fusion Agent (Late Fusion)

각 에이전트의 독립성을 유지하면서 Cross-attention으로 비디오-오디오 상호작용 반영.

```python
class FusionAgent:
    def ensemble(self, results, weights):
        video_score = results['video']['confidence'] * weights['video']
        audio_score = results.get('audio', {}).get('confidence', 0) * weights['audio']
        return aggregate(video_score, audio_score)
```

---

## 6. Loss 설계

```python
class FocalLoss(nn.Module):
    """클래스 불균형 대응 (AIGVDBench 478k >> Celeb-DF 6.5k)"""
    def forward(self, logits, targets):
        ce = F.cross_entropy(logits, targets, reduction='none', label_smoothing=0.1)
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()

# Multi-task Loss (멀티모달 통합 시)
total_loss = (
    1.0 * binary_loss +       # real/fake (최우선)
    0.5 * ai_model_loss +     # 23개 AI 모델 분류
    0.3 * manipulation_loss + # 조작 유형
    0.7 * audio_loss          # 음성 합성
)
```

---

## 7. 벡터 DB 통합

학습 단계는 S3 + .npz로 충분. 벡터 DB는 **서빙 단계**에서 활용.

```sql
-- AI 모델 시그니처 (유사 케이스 검색)
CREATE TABLE agent_core.ai_model_signatures (
    signature_id UUID PRIMARY KEY,
    ai_model_name VARCHAR(50),
    signature_embedding vector(512),
    sample_count INTEGER,
    created_at TIMESTAMP
);

-- 멀티모달 임베딩 캐시 (동일 영상 재분석 방지)
CREATE TABLE agent_core.multimodal_embeddings (
    media_id UUID PRIMARY KEY,
    video_embedding vector(512),
    audio_embedding vector(768),
    fused_embedding vector(256),
    metadata JSONB,
    created_at TIMESTAMP
);

-- 분석 메모리 (RAG)
CREATE TABLE agent_core.analysis_memory (
    analysis_id UUID PRIMARY KEY,
    query_embedding vector(1536),
    analysis_result JSONB,
    agent_chain VARCHAR[],
    created_at TIMESTAMP
);
```

**유사 케이스 검색:**
```sql
SELECT ai_model_name,
       1 - (signature_embedding <=> $1::vector) as similarity
FROM agent_core.ai_model_signatures
ORDER BY signature_embedding <=> $1::vector
LIMIT 3;
-- 결과: "과거 분석된 Sora 케이스와 92% 유사합니다"
```

---

## 8. 최종 출력 포맷

```json
{
  "verdict": "fake",
  "confidence": 0.94,
  "breakdown": {
    "video": {
      "is_fake": true,
      "ai_model": "Sora",
      "confidence": 0.87
    },
    "audio": {
      "is_synthetic": true,
      "voice_model": "ElevenLabs",
      "confidence": 0.92
    },
    "sync": {
      "is_synced": false,
      "confidence": 0.73
    }
  },
  "explanation": "영상: Sora로 생성됨 (87%) | 음성: ElevenLabs 합성 (92%) | 립싱크 불일치 감지",
  "similar_cases": [{"similarity": 0.89, "description": "유사 케이스"}],
  "recommendation": {
    "quiz_topics": ["sora_detection", "voice_synthesis", "lip_sync_analysis"]
  }
}
```

---

## 9. 인프라 및 서빙 구조

```
CloudFront → ALB → Envoy → Video Analysis Service
                               │
                               ├── [경량] EKS Pod (XGBoost Cascade 1단계)
                               │    └── 응답 < 50ms
                               └── [중량] SageMaker Endpoint
                                    └── VideoAgent CNN 추론 (GPU)
```

**SageMaker 파이프라인:**
```python
pipeline = Pipeline(
    name="pawfiler-ai-detection",
    steps=[
        ProcessingStep(name="feature-engineering"),
        TrainingStep(name="train-xgboost"),   # Cascade 1단계
        TrainingStep(name="train-backbone"),  # VideoAgent backbone
    ]
)
```

---

## 10. 학습 단계 로드맵

| 단계 | 데이터 | 목표 | 상태 |
|---|---|---|---|
| Phase 1 | Celeb-DF + WildDeepfake | Real/Fake 이진 분류 베이스라인 | 예정 |
| Phase 2 | AIGVDBench | 35클래스 AI 모델 식별 (Transfer Learning) | **진행 중** |
| Phase 3 | DFADD | Audio Agent (Wav2Vec2 + HMM) | 예정 |
| Phase 4 | 전체 | Fusion Agent + 오케스트레이터 통합 | 예정 |

**현재 SageMaker 실험 진행 상황:**
- Step 1 (스모크, 10% 데이터, 1 epoch): ✅ 완료 → MobileViTv2-100 F1 0.6457 1위
- Step 2 (미니 벤치마크, 50% 데이터, 5 epoch): 예정
- Step 3 (풀 학습): backbone 결정 후 진행

---

## 11. MLOps

```
데이터 수집 → 전처리(완료) → 피처 엔지니어링 → 학습 → 평가
     ↑                                                   │
     └─────────── 재학습 트리거 ←── 모니터링 ←── 배포 ←──┘
```

**재학습 트리거:** F1 < 0.85 / 새 딥페이크 기술 등장 (데이터 드리프트) / 월 1회 주기

**디버깅:**
```python
# SHAP으로 피처 중요도 해석
explainer = shap.TreeExplainer(xgb_model)
shap.summary_plot(explainer.shap_values(X_val), X_val)

# Confusion Matrix → 어떤 모델(Sora vs Gen2)을 헷갈리는지 확인
```

---

## 12. 아키텍처 의사결정 총정리 (문제 → 해결 → 선택)

> 디버깅부터 엔터프라이즈급 MLOps 설계까지의 여정을 **"문제 - 해결책 - 트레이드오프 및 최종 선택"** 프레임워크로 정리.

---

### Phase 1. 모델 학습 및 디버깅 (SageMaker Training)

**문제: F1 Score 0.0000의 저주 + OOM 에러**

| 진짜 원인 | 내용 |
|---|---|
| 데이터 편향 (Skew) | 10TB 데이터가 셔플 없이 순서대로 압축 → 검증용 뒷부분 샤드에 `audio_fake` 클래스만 100% 몰림 |
| 검증 루프 로직 누락 | 훈련 때는 XGBoost Cascade로 거르던 것을 검증 때는 적용 안 함 |
| 체급 불일치 | 무거운 EfficientNet-B4에 가벼운 모델용 배치 사이즈(64) 그대로 적용 → NCCL Error |

**해결 및 선택:**
- `train3.py` 검증 루프에 XGBoost Cascade 로직 추가
- 배치 사이즈 64 → 32로 조정
- **[핵심 선택] 10% 균등 추출 벤치마크**: 전체 샤드에서 10개 간격으로 하나씩 추출해 모든 클래스가 골고루 섞인 축소판을 만들고 5 epoch만 돌려 트렌드 비교 → 비용/시간 절감 극대화

---

### Phase 2. 멀티 에이전트 오케스트레이션 (Architecture)

**문제: < 200ms 레이턴시를 맞추기 위한 에이전트 구조**

LLM 기반 프레임워크는 속도 문제로 탈락. Video / Audio / Sync 모델 조합 시 200ms 이내 응답 필요.

| 방식 | 속도 | 확장성 | 결정 |
|---|---|---|---|
| A. 통합 에이전트 (모놀리식) | ✅ 빠름 | ❌ 최악 | 탈락 |
| B. 논리적 에이전트 래핑 (마이크로서비스) | △ 저하 우려 | ✅ 최상 | **채택** |

**선택: Ray Serve 기반 논리적 에이전트 래핑**

B안의 속도 저하 단점은 **Ray의 Zero-Copy 공유 메모리(Plasma Store)** 로 상쇄. 텐서(영상) 복사 시간을 0으로 만들어 속도 문제 해소.

---

### Phase 3. 인프라와 MLOps (EKS vs SageMaker)

**문제 1: 네트워크 지연(Network Hop)으로 200ms 달성 불가**

EKS(오케스트레이터)와 SageMaker Endpoint(추론)가 분리되면 무거운 영상을 통신망으로 전송할 때 지연 발생.

| 방식 | 비용 | 속도 | 이식성 | 결정 |
|---|---|---|---|---|
| A. SageMaker 풀스택 | 비쌈 | 느림 | ❌ AWS 종속 | 탈락 |
| B. BYOC (Docker + Ray Serve) | 저렴 | 빠름 | ✅ 완벽 | **채택** |

**선택: SageMaker는 학습용 GPU로만, 추론은 오픈소스(BYOC)로 독립**

- 오케스트레이터와 모델을 같은 컨테이너/파드에 배치 → 네트워크 지연 소멸
- AWS / GCP / 온프레미스 어디든 Docker만 띄우면 동일하게 동작

---

**문제 2: BYOC 전환 후 컨테이너 비대화(Cold Start) + 관리 도구 부재**

**해결: 3가지 무기 조합 (80/20 Rule)**

| 무기 | 해결하는 문제 | 효과 |
|---|---|---|
| **EFS 마운트** | 15GB 모델 가중치를 Docker 이미지에서 분리 | Cold Start 10분 → 30초 |
| **MLflow** | SageMaker가 해주던 모델 버전 관리 대체 | 실험 추적 + 모델 레지스트리 |
| **Prometheus / Grafana** | 실시간 레이턴시 / GPU 모니터링 | SageMaker 모니터링 완벽 대체 |

**YAGNI 원칙 적용:** 데이터 드리프트 감지, 섀도우 테스트 등 고급 기능은 프로덕션 트래픽이 쌓인 이후로 미룸. 지금은 동작하는 시스템을 먼저.
