-- Hybrid Search: FTS 컬럼 및 인덱스 추가 (기존 DB 마이그레이션)
-- 실행: psql $DATABASE_URL -f migrate-chatbot-fts.sql

ALTER TABLE chatbot.knowledge_base
ADD COLUMN IF NOT EXISTS tsv tsvector
GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_chatbot_kb_fts
ON chatbot.knowledge_base USING gin(tsv);
