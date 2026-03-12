-- PawFiler Vector DB Setup
-- pgvector 확장 및 벡터 테이블 생성

-- 1. pgvector 확장 설치
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- Trigram 검색용

-- 2. Agent Core 스키마 생성
CREATE SCHEMA IF NOT EXISTS agent_core;

-- 3. AI 모델 시그니처 테이블
CREATE TABLE agent_core.ai_model_signatures (
    signature_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_model_name VARCHAR(50) NOT NULL,
    signature_embedding vector(512) NOT NULL,
    characteristic_features JSONB,
    sample_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_model_signatures_embedding 
ON agent_core.ai_model_signatures 
USING hnsw (signature_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_ai_model_name 
ON agent_core.ai_model_signatures(ai_model_name);

-- 4. 멀티모달 임베딩 테이블
CREATE TABLE agent_core.multimodal_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(20) NOT NULL,  -- 'video', 'audio', 'text', 'image'
    source_id UUID NOT NULL,
    embedding vector(768) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_multimodal_embedding 
ON agent_core.multimodal_embeddings 
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_multimodal_source 
ON agent_core.multimodal_embeddings(source_type, source_id);

-- 5. 에이전트 분석 메모리 (RAG)
CREATE TABLE agent_core.analysis_memory (
    analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_query TEXT,
    query_embedding vector(1536) NOT NULL,
    analysis_result JSONB NOT NULL,
    agent_chain VARCHAR[] NOT NULL,
    success_rate FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analysis_memory_embedding 
ON agent_core.analysis_memory 
USING hnsw (query_embedding vector_cosine_ops);

-- 6. 조작 패턴 지식 베이스
CREATE TABLE agent_core.manipulation_patterns (
    pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(100) NOT NULL,
    pattern_embedding vector(512) NOT NULL,
    manipulation_category VARCHAR(50),
    detection_method TEXT,
    example_media_ids UUID[],
    confidence_threshold FLOAT DEFAULT 0.7,
    first_seen TIMESTAMP DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1
);

CREATE INDEX idx_manipulation_patterns_embedding 
ON agent_core.manipulation_patterns 
USING hnsw (pattern_embedding vector_cosine_ops);

CREATE INDEX idx_manipulation_category 
ON agent_core.manipulation_patterns(manipulation_category);

-- 7. 사용자 학습 프로필 벡터
CREATE TABLE quiz.user_skill_vectors (
    user_id UUID PRIMARY KEY,
    skill_embedding vector(256) NOT NULL,
    weak_categories VARCHAR[],
    learning_stage VARCHAR(50),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_skill_embedding 
ON quiz.user_skill_vectors 
USING hnsw (skill_embedding vector_cosine_ops);

-- 8. 커뮤니티 게시글 임베딩
CREATE TABLE community.post_embeddings (
    post_id UUID PRIMARY KEY REFERENCES community.posts(id) ON DELETE CASCADE,
    content_embedding vector(1536) NOT NULL,
    related_quiz_ids UUID[],
    topic_cluster INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_post_embeddings_embedding 
ON community.post_embeddings 
USING hnsw (content_embedding vector_cosine_ops);

-- 9. 커뮤니티 검색 최적화 (Trigram)
CREATE INDEX idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);

CREATE INDEX idx_posts_body_trgm 
ON community.posts USING gin(body gin_trgm_ops);

-- 10. 기타 최적화 인덱스
CREATE INDEX idx_users_level_xp 
ON auth.users(level DESC, xp DESC);

CREATE INDEX idx_comments_author_id 
ON community.comments(author_id);

-- 11. 헬퍼 함수: 코사인 유사도 계산
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS float AS $$
    SELECT 1 - (a <=> b);
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

-- 12. 헬퍼 함수: 유사 AI 모델 검색
CREATE OR REPLACE FUNCTION find_similar_ai_models(
    query_embedding vector(512),
    similarity_threshold float DEFAULT 0.7,
    max_results int DEFAULT 5
)
RETURNS TABLE (
    ai_model_name VARCHAR(50),
    similarity float,
    sample_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.ai_model_name,
        cosine_similarity(s.signature_embedding, query_embedding) as similarity,
        s.sample_count
    FROM agent_core.ai_model_signatures s
    WHERE cosine_similarity(s.signature_embedding, query_embedding) >= similarity_threshold
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- 13. 헬퍼 함수: 유사 분석 케이스 검색
CREATE OR REPLACE FUNCTION find_similar_analysis(
    query_embedding vector(1536),
    max_results int DEFAULT 10
)
RETURNS TABLE (
    analysis_id UUID,
    user_query TEXT,
    analysis_result JSONB,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.analysis_id,
        a.user_query,
        a.analysis_result,
        cosine_similarity(a.query_embedding, query_embedding) as similarity
    FROM agent_core.analysis_memory a
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '✅ Vector DB setup completed!';
    RAISE NOTICE '📊 Created tables:';
    RAISE NOTICE '  - agent_core.ai_model_signatures';
    RAISE NOTICE '  - agent_core.multimodal_embeddings';
    RAISE NOTICE '  - agent_core.analysis_memory';
    RAISE NOTICE '  - agent_core.manipulation_patterns';
    RAISE NOTICE '  - quiz.user_skill_vectors';
    RAISE NOTICE '  - community.post_embeddings';
    RAISE NOTICE '🔍 Created indexes: HNSW + Trigram';
    RAISE NOTICE '🛠️  Created helper functions: cosine_similarity, find_similar_*';
END $$;
