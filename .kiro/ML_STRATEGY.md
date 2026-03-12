# PawFiler ML 전략: 멀티모달 AI 미디어 탐지

## 🎯 핵심 목표

**"이 영상은 Sora로 만들어졌습니다"** - AI 모델 식별
**"딥페이크(얼굴 합성) 탐지"** - 조작 유형 분류
**"음성 합성 탐지"** - 가짜 음성 식별
**"립싱크 불일치"** - 멀티모달 검증

→ **설명 가능한 AI 탐지 시스템**

---

## 📊 데이터셋 전략

### 사용 데이터셋 (4개)

| 데이터셋 | 용도 | 특징 |
|---------|------|------|
| **AIGVDBench** | AI 모델 분류 (23개) | Sora, Runway, Pika 등 최신 생성 모델 라벨링 |
| **Celeb-DF** | 딥페이크 탐지 | 고품질 얼굴 합성, 벤치마크 |
| **WildDeepfake** | 실전 적응 | 실제 인터넷 수집, 다양한 품질 |
| **MLAAD** | 멀티모달 학습 | 오디오-비주얼, 립싱크 분석 |

### 학습 전략

#### **Phase 1: Base Training (기본 탐지 능력)**
```
데이터: Celeb-DF + WildDeepfake
목표: Real vs Fake 이진 분류
기간: 50 epochs
```

#### **Phase 2: AI Model Identification (핵심)** ⭐
```
데이터: AIGVDBench
목표: 23개 AI 모델 분류 (Sora, Runway, Pika, ...)
방법: Transfer Learning (Phase 1 모델 활용)
기간: 30 epochs

출력:
- "이 영상은 Sora로 생성되었습니다 (87%)"
- 모델별 시그니처 벡터 추출 → 벡터 DB 저장
```

#### **Phase 3: Multimodal Fusion**
```
데이터: MLAAD
목표: 오디오-비주얼 통합 분석
- 음성 합성 탐지
- 립싱크 불일치 감지
기간: 20 epochs
```

#### **Phase 4: Real-world Adaptation**
```
데이터: WildDeepfake
목표: 실제 환경 Fine-tuning
기간: 10 epochs
```

---

## 🏗️ 멀티모달 아키텍처

### 독립 + 융합 구조

```
Input Video
    ├── Video Frames → Video Agent → "Sora로 생성됨 (87%)"
    ├── Audio Track → Audio Agent → "ElevenLabs 음성 (92%)"
    └── Sync Check → Sync Agent → "립싱크 불일치 감지"
                        ↓
                  Fusion Agent
                        ↓
            종합 판단: "영상: Sora | 음성: 가짜 | 립싱크: 불일치"
```

### 모델 구성

#### **1. Video Agent**
- **Backbone**: MobileViT-v2 (경량화)
- **Temporal**: LSTM (프레임 간 시간 정보)
- **출력**:
  - Binary: Real vs Fake
  - AI Model: 23개 모델 분류 (AIGVDBench)
  - Manipulation: face_swap, lip_sync 등
- **특징 벡터**: 512차원

#### **2. Audio Agent**
- **Backbone**: Wav2Vec2
- **출력**:
  - Binary: Real vs Synthetic
  - Voice Model: ElevenLabs, Resemble 등
- **특징 벡터**: 768차원

#### **3. Sync Agent**
- **Backbone**: SyncNet
- **출력**: 립싱크 일치도 (0~1)

#### **4. Fusion Agent**
- **방법**: Late Fusion (각 에이전트 독립성 유지)
- **Cross-attention**: 비디오-오디오 상호작용
- **최종 출력**: 통합 판단 + 설명

---

## 🔧 전처리 파이프라인

### Video 전처리
```python
1. 프레임 추출 (1 FPS, 최대 32프레임)
2. 얼굴 탐지 (MTCNN) + 크롭
3. 데이터 증강 (학습 시)
   - 좌우 반전
   - 밝기 조정
   - JPEG 압축 시뮬레이션
4. 정규화 (224x224, ImageNet 평균/표준편차)
```

### Audio 전처리
```python
1. 비디오에서 오디오 추출 (ffmpeg)
2. 리샘플링 (16kHz, mono)
3. 특징 추출
   - Mel-spectrogram
   - MFCC
   - Wav2Vec2 features
4. 데이터 증강 (학습 시)
   - 노이즈 추가
   - 피치 변경
   - 속도 변경
```

---

## 🎓 Multi-task Learning

### 하나의 모델, 여러 작업

```python
class MultiTaskDeepfakeDetector:
    outputs = {
        'is_fake': Binary Classification,      # 모든 데이터셋
        'ai_model': 23-class Classification,   # AIGVDBench만
        'manipulation_type': 5-class,          # Celeb-DF, WildDeepfake
        'audio_synthetic': Binary,             # MLAAD
        'lip_sync': Regression                 # MLAAD
    }
```

### Loss 가중치
```python
total_loss = (
    1.0 * binary_loss +           # 가장 중요
    0.5 * ai_model_loss +         # AIGVDBench
    0.3 * manipulation_loss +     # 조작 유형
    0.7 * audio_loss              # 음성 합성
)
```

---

## 🗄️ 벡터 DB 통합

### 저장할 벡터

#### 1. AI 모델 시그니처
```sql
CREATE TABLE agent_core.ai_model_signatures (
    signature_id UUID PRIMARY KEY,
    ai_model_name VARCHAR(50),        -- 'Sora', 'Runway', etc.
    signature_embedding vector(512),  -- 모델별 특징 벡터
    characteristic_features JSONB,    -- 모델 특성
    sample_count INTEGER,
    created_at TIMESTAMP
);
```

#### 2. 멀티모달 임베딩
```sql
CREATE TABLE agent_core.multimodal_embeddings (
    media_id UUID PRIMARY KEY,
    video_embedding vector(512),
    audio_embedding vector(768),
    fused_embedding vector(256),
    metadata JSONB,
    created_at TIMESTAMP
);
```

#### 3. 분석 메모리 (RAG)
```sql
CREATE TABLE agent_core.analysis_memory (
    analysis_id UUID PRIMARY KEY,
    query_embedding vector(1536),
    analysis_result JSONB,
    agent_chain VARCHAR[],
    created_at TIMESTAMP
);
```

### 활용 방법

#### 유사 케이스 검색
```sql
-- 새로운 영상과 유사한 AI 모델 찾기
SELECT ai_model_name, 
       1 - (signature_embedding <=> $1::vector) as similarity
FROM agent_core.ai_model_signatures
ORDER BY signature_embedding <=> $1::vector
LIMIT 3;
```

#### 설명 생성
```python
# 결과: "이 영상은 Sora로 생성되었을 가능성 87%"
# "과거 분석된 Sora 케이스와 92% 유사합니다"
```

---

## 🎮 응용 기능

### 1. 퀴즈 문제 자동 생성
```python
# AIGVDBench의 23개 모델 활용
quiz = {
    "question": "이 영상은 어떤 AI로 만들어졌을까요?",
    "options": ["Sora", "Runway", "Pika", "실제 영상"],
    "video": sample_from_AIGVDBench('Sora'),
    "answer": "Sora",
    "explanation": "Sora의 특징: 높은 시간적 일관성, 자연스러운 모션"
}
```

### 2. 트렌드 분석
```python
# 최근 업로드된 영상들의 AI 모델 분포
recent_videos = get_recent_uploads()
model_distribution = analyze_ai_models(recent_videos)

# 결과: "최근 Sora 사용이 30% 증가했습니다"
#       "Runway Gen-2가 새롭게 등장했습니다"
```

### 3. 개인화 학습 경로
```python
# 사용자가 "Sora 탐지" 문제를 자주 틀림
# → Sora 관련 퀴즈 추천
# → 유사한 약점을 가진 사용자들의 학습 경로 제시
```

---

## 📈 최종 출력 예시

```json
{
  "verdict": "fake",
  "confidence": 0.94,
  "breakdown": {
    "video": {
      "is_fake": true,
      "ai_model": "Sora",
      "confidence": 0.87,
      "manipulation_type": null
    },
    "audio": {
      "is_synthetic": true,
      "voice_model": "ElevenLabs",
      "confidence": 0.92,
      "artifacts": ["pitch_inconsistency"]
    },
    "sync": {
      "is_synced": false,
      "confidence": 0.73
    }
  },
  "explanation": "영상: Sora로 생성됨 (87%) | 음성: ElevenLabs 합성 (92%) | 립싱크 불일치 감지",
  "similar_cases": [
    {
      "video_id": "...",
      "similarity": 0.89,
      "description": "2024년 3월 유사 케이스"
    }
  ],
  "recommendation": {
    "quiz_topics": ["sora_detection", "voice_synthesis", "lip_sync_analysis"],
    "learning_path": "AI 생성 영상 탐지 → 음성 합성 구별 → 립싱크 분석"
  }
}
```

---

## 🚀 구현 우선순위

### Phase 1: 즉시 구현 (현재)
- [ ] Video Agent 구현 (MobileViT + LSTM)
- [ ] AIGVDBench 데이터 전처리
- [ ] 23개 AI 모델 분류 학습
- [ ] 벡터 추출 및 pgvector 저장

### Phase 2: 멀티모달 확장
- [ ] Audio Agent 구현 (Wav2Vec2)
- [ ] Sync Agent 구현 (SyncNet)
- [ ] Fusion Agent 구현 (Late Fusion)
- [ ] MLAAD 데이터 통합

### Phase 3: 고급 기능
- [ ] 퀴즈 자동 생성 시스템
- [ ] 트렌드 분석 대시보드
- [ ] 개인화 학습 경로 추천
- [ ] Few-shot Learning (새 AI 모델 빠른 적응)

---

## 💡 핵심 인사이트

1. **AIGVDBench가 핵심**: 23개 AI 모델 라벨링으로 "어떤 AI로 만들어졌는지" 식별 가능
2. **멀티모달 = 독립 + 융합**: 각 에이전트가 전문성을 유지하면서 협업
3. **벡터 DB = 지식 베이스**: 과거 분석 결과를 기억하고 활용
4. **설명 가능성**: "왜 가짜인지" 명확한 근거 제시
5. **교육 플랫폼 특화**: 퀴즈 생성, 트렌드 분석, 학습 경로 추천

---

## 📚 참고 자료

- MobileViT: https://arxiv.org/abs/2110.02178
- Wav2Vec2: https://arxiv.org/abs/2006.11477
- SyncNet: https://www.robots.ox.ac.uk/~vgg/publications/2016/Chung16a/
- pgvector: https://github.com/pgvector/pgvector
