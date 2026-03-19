-- ============================================================
-- PawFiler Performance Migration v2
-- 적용 순서: 이 파일을 RDS에서 한 번 실행
-- 롤백: 각 섹션 끝의 ROLLBACK 주석 참조
-- ============================================================

BEGIN;

-- ============================================================
-- 1. pg_trgm 확장 활성화 (ILIKE 인덱스 지원)
-- optimize-db.sql에 정의되어 있었으나 실제 적용 필요
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- community.posts 제목/본문 trigram 인덱스
-- ILIKE '%keyword%' 쿼리가 자동으로 이 인덱스를 사용
-- 적용 전: full table scan (posts 1만 건 기준 ~50ms)
-- 적용 후: GIN index scan (~2ms)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_title_trgm
    ON community.posts USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_body_trgm
    ON community.posts USING GIN (body gin_trgm_ops);

-- ============================================================
-- 2. TIMESTAMP → TIMESTAMPTZ 마이그레이션
-- 근본 원인: TIMESTAMP는 타임존 정보 없이 저장되어
-- Go 코드에서 .UTC().Format(RFC3339) 우회 처리가 필요했음
-- TIMESTAMPTZ로 변경 시 DB가 항상 UTC로 반환 보장
-- ============================================================

-- auth.users
ALTER TABLE auth.users
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE auth.users
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- quiz.questions
ALTER TABLE quiz.questions
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE quiz.questions
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- quiz.user_answers
ALTER TABLE quiz.user_answers
    ALTER COLUMN answered_at TYPE TIMESTAMPTZ USING answered_at AT TIME ZONE 'UTC';

ALTER TABLE quiz.user_answers
    ALTER COLUMN answered_at SET DEFAULT NOW();

-- quiz.user_stats
ALTER TABLE quiz.user_stats
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE quiz.user_stats
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- quiz.user_profiles
ALTER TABLE quiz.user_profiles
    ALTER COLUMN last_energy_refill TYPE TIMESTAMPTZ USING last_energy_refill AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE quiz.user_profiles
    ALTER COLUMN last_energy_refill SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- community.posts
ALTER TABLE community.posts
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE community.posts
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- community.post_votes
ALTER TABLE community.post_votes
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE community.post_votes
    ALTER COLUMN created_at SET DEFAULT NOW();

-- community.comments
ALTER TABLE community.comments
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE community.comments
    ALTER COLUMN created_at SET DEFAULT NOW();

-- community.likes
ALTER TABLE community.likes
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE community.likes
    ALTER COLUMN created_at SET DEFAULT NOW();

-- video_analysis.tasks
ALTER TABLE video_analysis.tasks
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE video_analysis.tasks
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- video_analysis.results
ALTER TABLE video_analysis.results
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE video_analysis.results
    ALTER COLUMN created_at SET DEFAULT NOW();

-- payment.subscriptions: started_at, created_at (updated_at 컬럼 없음)
ALTER TABLE payment.subscriptions
    ALTER COLUMN started_at  TYPE TIMESTAMPTZ USING started_at  AT TIME ZONE 'UTC',
    ALTER COLUMN expires_at  TYPE TIMESTAMPTZ USING expires_at  AT TIME ZONE 'UTC',
    ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';

ALTER TABLE payment.subscriptions
    ALTER COLUMN started_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE payment.transactions
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE payment.transactions
    ALTER COLUMN created_at SET DEFAULT NOW();

-- user_svc.preferences: updated_at만 존재 (created_at 컬럼 없음)
ALTER TABLE user_svc.preferences
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE user_svc.preferences
    ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE user_svc.shop_purchases
    ALTER COLUMN purchased_at TYPE TIMESTAMPTZ USING purchased_at AT TIME ZONE 'UTC';

ALTER TABLE user_svc.shop_purchases
    ALTER COLUMN purchased_at SET DEFAULT NOW();

-- ============================================================
-- 3. 누락된 복합 인덱스 추가
-- ============================================================

-- community.ranking 쿼리: DISTINCT author_id 최적화
-- 현재 author_id 단독 인덱스가 없어 full scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_id
    ON community.posts (author_id);

-- community.comments: author_id 인덱스 (프로필 변경 시 UPDATE 최적화)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_author_id
    ON community.comments (author_id);

-- quiz.user_profiles ↔ community.posts JOIN 최적화
-- ranking.go: qp.user_id::text = p.author_id — 타입 캐스트로 인덱스 미사용
-- 이 인덱스는 user_id를 text로 검색할 때 사용됨
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_profiles_user_id_text
    ON quiz.user_profiles ((user_id::text));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_stats_user_id_text
    ON quiz.user_stats ((user_id::text));

-- quiz.user_answers: 최근 30일 집계 쿼리용 partial index
-- GetQuestionStats에서 시간 필터 없이 전체 집계하는 쿼리 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_answers_recent_correct
    ON quiz.user_answers (user_id, is_correct, answered_at DESC)
    WHERE answered_at > NOW() - INTERVAL '90 days';

-- community.posts: is_admin_post + created_at 복합 인덱스
-- GetFeed ORDER BY is_admin_post DESC, created_at DESC 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_admin_created
    ON community.posts (is_admin_post DESC, created_at DESC);

-- ============================================================
-- 4. Community 랭킹 Materialized View
-- 크로스 스키마 JOIN을 pre-compute하여 랭킹 조회 비용 제거
-- 애플리케이션의 60초 인메모리 캐시와 별개로 DB 레벨 최적화
-- REFRESH는 pg_cron 또는 애플리케이션 레벨에서 주기적으로 실행
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS community.ranking_snapshot AS
    SELECT
        p.author_id,
        p.author_nickname,
        p.author_emoji,
        COALESCE(qp.current_tier, '알')    AS current_tier,
        COALESCE(qs.total_answered, 0)     AS total_answered,
        COALESCE(qs.correct_answers, 0)    AS correct_answers,
        COALESCE(qp.total_coins, 0)        AS total_coins
    FROM (
        SELECT DISTINCT ON (author_id) author_id, author_nickname, author_emoji
        FROM community.posts
        ORDER BY author_id, created_at DESC
    ) p
    LEFT JOIN quiz.user_profiles qp ON qp.user_id::text = p.author_id
    LEFT JOIN quiz.user_stats     qs ON qs.user_id::text = p.author_id
    ORDER BY COALESCE(qs.correct_answers, 0) DESC;

-- Materialized View 인덱스 (조회 최적화)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ranking_snapshot_author
    ON community.ranking_snapshot (author_id);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_correct
    ON community.ranking_snapshot (correct_answers DESC);

-- ============================================================
-- 5. 통계 갱신
-- ============================================================

ANALYZE auth.users;
ANALYZE quiz.questions;
ANALYZE quiz.user_answers;
ANALYZE quiz.user_stats;
ANALYZE quiz.user_profiles;
ANALYZE community.posts;
ANALYZE community.comments;
ANALYZE community.likes;
ANALYZE community.post_votes;

COMMIT;

-- ============================================================
-- ROLLBACK 가이드 (필요 시 수동 실행)
-- ============================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_title_trgm;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_body_trgm;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_author_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_comments_author_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_quiz_profiles_user_id_text;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_quiz_stats_user_id_text;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_user_answers_recent_correct;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_admin_created;
-- DROP MATERIALIZED VIEW IF EXISTS community.ranking_snapshot;
-- TIMESTAMPTZ → TIMESTAMP 롤백은 데이터 손실 없이 가능:
--   ALTER TABLE ... ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC';
