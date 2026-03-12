# PawFiler 데이터베이스 최적화 전략

## 📊 현재 DB 구조

### 스키마 구성
- `auth`: 사용자 인증
- `quiz`: 퀴즈 서비스
- `community`: 커뮤니티
- `video_analysis`: 영상 분석
- `payment`: 결제 (미구현)

### ORM 사용 현황
- **Quiz Service**: GORM (Go)
- **Community Service**: 직접 SQL (lib/pq)
- **Admin Service**: 직접 SQL (lib/pq)

---

## 🔍 쿼리 최적화 제안

### 즉시 추가 필요한 인덱스

#### 1. Community 검색 최적화 (HIGH) ⭐⭐⭐⭐⭐
```sql
-- 이유: title/body ILIKE 검색이 자주 발생하지만 Full Table Scan
-- 해결: Trigram 인덱스로 부분 문자열 검색 최적화

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);

CREATE INDEX idx_posts_body_trgm 
ON community.posts USING gin(body gin_trgm_ops);
```

**효과**: 검색 쿼리 속도 10~100배 향상

#### 2. Auth Users 랭킹 조회 (MEDIUM)
```sql
-- 이유: 리더보드 기능에서 레벨/XP 순위 조회
CREATE INDEX idx_users_level_xp 
ON auth.users(level DESC, xp DESC);
```

#### 3. Community Comments 작성자 조회 (MEDIUM)
```sql
-- 이유: "내가 쓴 댓글" 기능
CREATE INDEX idx_comments_author_id 
ON community.comments(author_id);
```

### 추가하지 말아야 할 인덱스

❌ **작은 테이블**: quiz.questions (현재 11개) - Full Scan이 더 빠름
❌ **이미 캐싱됨**: quiz.questions (Redis + 메모리 캐싱)
❌ **카디널리티 낮음**: status 컬럼 (값이 몇 개뿐)
❌ **쓰기 많음**: user_answers (인덱스 갱신 비용 큼)

---

## 🗄️ 벡터 DB 전략

### PostgreSQL + pgvector 사용 (권장)

#### 설치
```sql
CREATE EXTENSION vector;
```

#### 장점
- 기존 PostgreSQL 인프라 활용
- 트랜잭션 지원 (일관성 보장)
- 운영 복잡도 낮음
- 비용 절감

#### 단점
- 대규모 벡터 검색 시 성능 제한 (100만 개 이상)
- 전용 벡터 DB보다 느림

---

## 📐 벡터 DB 스키마 설계

### 1. AI 모델 시그니처 (핵심)
```sql
CREATE SCHEMA IF NOT EXISTS agent_core;

CREATE TABLE agent_core.ai_model_signatures (
    signature_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_model_name VARCHAR(50) NOT NULL,  -- 'Sora', 'Runway', 'Pika', etc.
    signature_embedding vector(512) NOT NULL,
    characteristic_features JSONB,
    sample_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW 인덱스 (빠른 유사도 검색)
CREATE INDEX ON agent_core.ai_model_signatures 
USING hnsw (signature_embedding vector_cosine_ops);
```

**활용**:
```sql
-- 새로운 영상과 유사한 AI 모델 찾기
SELECT ai_model_name, 
       1 - (signature_embedding <=> $1::vector) as similarity
FROM agent_core.ai_model_signatures
ORDER BY signature_embedding <=> $1::vector
LIMIT 3;
```

### 2. 멀티모달 임베딩
```sql
CREATE TABLE agent_core.multimodal_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(20) NOT NULL,  -- 'video', 'audio', 'text', 'image'
    source_id UUID NOT NULL,
    embedding vector(768) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON agent_core.multimodal_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- 소스별 조회 인덱스
CREATE INDEX idx_multimodal_source 
ON agent_core.multimodal_embeddings(source_type, source_id);
```

### 3. 에이전트 메모리 (RAG)
```sql
CREATE TABLE agent_core.analysis_memory (
    analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_query TEXT,
    query_embedding vector(1536) NOT NULL,  -- OpenAI embedding
    analysis_result JSONB NOT NULL,
    agent_chain VARCHAR[] NOT NULL,  -- 참여한 에이전트들
    success_rate FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON agent_core.analysis_memory 
USING hnsw (query_embedding vector_cosine_ops);
```

**활용**: 과거 분석 결과 검색
```sql
-- 유사한 질문의 과거 분석 결과 찾기
SELECT analysis_result, success_rate,
       1 - (query_embedding <=> $1::vector) as similarity
FROM agent_core.analysis_memory
WHERE 1 - (query_embedding <=> $1::vector) > 0.8
ORDER BY similarity DESC
LIMIT 5;
```

### 4. 조작 패턴 지식 베이스
```sql
CREATE TABLE agent_core.manipulation_patterns (
    pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(100) NOT NULL,
    pattern_embedding vector(512) NOT NULL,
    manipulation_category VARCHAR(50),  -- 'face_swap', 'lip_sync', etc.
    detection_method TEXT,
    example_media_ids UUID[],
    confidence_threshold FLOAT DEFAULT 0.7,
    first_seen TIMESTAMP DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1
);

CREATE INDEX ON agent_core.manipulation_patterns 
USING hnsw (pattern_embedding vector_cosine_ops);
```

### 5. 사용자 학습 프로필
```sql
CREATE TABLE quiz.user_skill_vectors (
    user_id UUID PRIMARY KEY,
    skill_embedding vector(256) NOT NULL,
    weak_categories VARCHAR[],
    learning_stage VARCHAR(50),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON quiz.user_skill_vectors 
USING hnsw (skill_embedding vector_cosine_ops);
```

**활용**: 유사한 학습 패턴을 가진 사용자 찾기
```sql
-- 비슷한 약점을 가진 사용자들의 학습 경로 추천
SELECT user_id, weak_categories,
       1 - (skill_embedding <=> $1::vector) as similarity
FROM quiz.user_skill_vectors
WHERE user_id != $2
ORDER BY similarity DESC
LIMIT 10;
```

### 6. 커뮤니티 의미 검색
```sql
CREATE TABLE community.post_embeddings (
    post_id UUID PRIMARY KEY REFERENCES community.posts(id) ON DELETE CASCADE,
    content_embedding vector(1536) NOT NULL,  -- 제목 + 본문
    related_quiz_ids UUID[],
    topic_cluster INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON community.post_embeddings 
USING hnsw (content_embedding vector_cosine_ops);
```

**활용**: 하이브리드 검색 (키워드 + 의미)
```sql
-- 키워드 검색 + 의미 검색 결합
WITH keyword_results AS (
    SELECT id, title, body, 
           ts_rank(to_tsvector('korean', title || ' ' || body), 
                   plainto_tsquery('korean', $1)) as keyword_score
    FROM community.posts
    WHERE to_tsvector('korean', title || ' ' || body) @@ plainto_tsquery('korean', $1)
),
semantic_results AS (
    SELECT p.id, p.title, p.body,
           1 - (pe.content_embedding <=> $2::vector) as semantic_score
    FROM community.posts p
    JOIN community.post_embeddings pe ON p.id = pe.post_id
    ORDER BY semantic_score DESC
    LIMIT 20
)
SELECT COALESCE(k.id, s.id) as id,
       COALESCE(k.title, s.title) as title,
       COALESCE(k.keyword_score, 0) * 0.4 + COALESCE(s.semantic_score, 0) * 0.6 as final_score
FROM keyword_results k
FULL OUTER JOIN semantic_results s ON k.id = s.id
ORDER BY final_score DESC
LIMIT 10;
```

---

## 🔧 벡터 추출 방법

### 1. 모델 중간 레이어에서 추출 (무료)
```python
# MobileViT 모델에서 특징 벡터 추출
class VideoEncoder:
    def extract_features(self, frame):
        """프레임 → 512차원 벡터"""
        with torch.no_grad():
            features = self.model.forward_features(frame)
            features = features.mean(dim=[2, 3])  # Global Average Pooling
        return features.cpu().numpy()
```

### 2. CLIP (멀티모달)
```python
from transformers import CLIPModel, CLIPProcessor

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# 이미지 → 512차원
image_embedding = model.get_image_features(**processor(images=image, return_tensors="pt"))

# 텍스트 → 512차원 (같은 공간!)
text_embedding = model.get_text_features(**processor(text=["딥페이크 탐지"], return_tensors="pt"))
```

### 3. OpenAI Embeddings (텍스트)
```python
from openai import OpenAI

client = OpenAI(api_key="...")

# 텍스트 → 1536차원
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="딥페이크 얼굴 합성 탐지 방법"
)
embedding = response.data[0].embedding
```

---

## 📊 구현 우선순위

### Phase 1: 즉시 구현
```sql
-- 1. pgvector 설치
CREATE EXTENSION vector;

-- 2. AI 모델 시그니처 테이블
CREATE TABLE agent_core.ai_model_signatures (...);

-- 3. Community 검색 최적화
CREATE INDEX idx_posts_title_trgm ON community.posts USING gin(title gin_trgm_ops);
```

### Phase 2: 멀티모달 확장
```sql
-- 4. 멀티모달 임베딩
CREATE TABLE agent_core.multimodal_embeddings (...);

-- 5. 에이전트 메모리
CREATE TABLE agent_core.analysis_memory (...);
```

### Phase 3: 개인화 기능
```sql
-- 6. 사용자 학습 프로필
CREATE TABLE quiz.user_skill_vectors (...);

-- 7. 커뮤니티 의미 검색
CREATE TABLE community.post_embeddings (...);
```

---

## 🎯 성능 최적화 팁

### HNSW 인덱스 파라미터 조정
```sql
-- m: 연결 수 (기본 16, 높을수록 정확하지만 느림)
-- ef_construction: 구축 시 탐색 깊이 (기본 64)
CREATE INDEX ON table_name 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### 쿼리 최적화
```sql
-- 검색 시 탐색 깊이 조정
SET hnsw.ef_search = 100;  -- 기본 40, 높을수록 정확하지만 느림

-- 유사도 임계값 설정
SELECT * FROM table_name
WHERE 1 - (embedding <=> $1::vector) > 0.8  -- 80% 이상만
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### VACUUM 및 ANALYZE
```sql
-- 벡터 인덱스 최적화
VACUUM ANALYZE agent_core.ai_model_signatures;
VACUUM ANALYZE agent_core.multimodal_embeddings;
```

---

## 💡 핵심 인사이트

1. **pgvector로 시작**: 기존 인프라 활용, 운영 간단
2. **HNSW 인덱스 필수**: 빠른 유사도 검색
3. **하이브리드 검색**: 키워드 + 의미 검색 결합
4. **벡터 차원 선택**:
   - 512차원: MobileViT, CLIP (경량)
   - 768차원: Wav2Vec2 (오디오)
   - 1536차원: OpenAI (텍스트, 고품질)
5. **나중에 고려**: Pinecone/Weaviate (100만 개 이상 시)
