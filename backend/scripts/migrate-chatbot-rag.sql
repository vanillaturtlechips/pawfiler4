-- chatbot 스키마 및 knowledge_base 테이블 생성
-- agent_core 스키마와 완전 분리

CREATE SCHEMA IF NOT EXISTS chatbot;

CREATE TABLE chatbot.knowledge_base (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file VARCHAR(100) NOT NULL,
    section     VARCHAR(200),
    content     TEXT NOT NULL,
    embedding   vector(1024) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chatbot_kb_embedding
ON chatbot.knowledge_base
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chatbot_kb_source ON chatbot.knowledge_base(source_file);
