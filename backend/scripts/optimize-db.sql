-- PawFiler DB 최적화 스크립트
-- 실행 전 백업 필수!

-- ============================================
-- 1. Fillfactor 설정 (HOT 최적화)
-- ============================================

-- 자주 업데이트되는 테이블
ALTER TABLE quiz.user_stats SET (fillfactor = 70);
ALTER TABLE community.posts SET (fillfactor = 80);

-- 확인
SELECT tablename, reloptions 
FROM pg_tables 
WHERE schemaname IN ('quiz', 'community')
  AND tablename IN ('user_stats', 'posts');

-- ============================================
-- 2. Autovacuum 튜닝
-- ============================================

-- user_stats: 매우 빈번한 업데이트
ALTER TABLE quiz.user_stats SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 50,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 50
);

-- posts: 중간 빈도 업데이트
ALTER TABLE community.posts SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_vacuum_threshold = 100,
    autovacuum_analyze_scale_factor = 0.05,
    autovacuum_analyze_threshold = 100
);

-- user_answers: 삽입만 (기본값 유지)
-- 설정 불필요

-- ============================================
-- 3. 검색 최적화 인덱스
-- ============================================

-- Trigram 확장 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Community 검색 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_body_trgm 
ON community.posts USING gin(body gin_trgm_ops);

-- ============================================
-- 4. Partial Index (선택적 인덱스)
-- ============================================

-- 최근 30일 답변만 인덱싱 (분석용)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_answers_recent 
ON quiz.user_answers(user_id, is_correct, answered_at)
WHERE answered_at > NOW() - INTERVAL '30 days';

-- ============================================
-- 5. 통계 정보 업데이트
-- ============================================

ANALYZE quiz.questions;
ANALYZE quiz.user_answers;
ANALYZE quiz.user_stats;
ANALYZE community.posts;
ANALYZE community.comments;
ANALYZE community.likes;

-- ============================================
-- 6. 현재 상태 확인
-- ============================================

-- 테이블 크기
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                      pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Dead tuples 확인
SELECT schemaname, tablename,
       n_live_tup,
       n_dead_tup,
       round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
       last_vacuum,
       last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY n_dead_tup DESC;

-- 인덱스 사용률
SELECT schemaname, tablename, indexname,
       idx_scan as scans,
       idx_tup_read as tuples_read,
       idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY idx_scan DESC;

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ DB 최적화 완료!';
    RAISE NOTICE '📊 위 통계를 확인하세요.';
    RAISE NOTICE '⏰ 다음 단계: Connection Pool 설정 조정';
END $$;
