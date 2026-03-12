-- PawFiler DB 모니터링 쿼리
-- 주간 실행 권장

-- ============================================
-- 1. 연결 상태
-- ============================================

\echo '📊 현재 연결 수'
SELECT 
    count(*) as total_connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = 'pawfiler_db';

\echo ''
\echo '📱 애플리케이션별 연결'
SELECT 
    COALESCE(application_name, 'unknown') as app,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active
FROM pg_stat_activity
WHERE datname = 'pawfiler_db'
GROUP BY application_name
ORDER BY connections DESC;

-- ============================================
-- 2. 테이블 크기 및 Bloat
-- ============================================

\echo ''
\echo '💾 테이블 크기 (상위 10개)'
SELECT 
    schemaname || '.' || tablename as table_name,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) as index_size,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    CASE 
        WHEN n_live_tup + n_dead_tup > 0 
        THEN round(n_dead_tup * 100.0 / (n_live_tup + n_dead_tup), 2)
        ELSE 0 
    END as dead_ratio
FROM pg_tables t
JOIN pg_stat_user_tables s ON t.tablename = s.tablename AND t.schemaname = s.schemaname
WHERE t.schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY pg_total_relation_size(t.schemaname||'.'||t.tablename) DESC
LIMIT 10;

-- ============================================
-- 3. Dead Tuples 경고
-- ============================================

\echo ''
\echo '⚠️  Dead Tuple 비율 높은 테이블 (>10%)'
SELECT 
    schemaname || '.' || tablename as table_name,
    n_live_tup as live,
    n_dead_tup as dead,
    round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
  AND n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0) > 10
ORDER BY dead_ratio DESC;

-- ============================================
-- 4. 인덱스 사용률
-- ============================================

\echo ''
\echo '📈 인덱스 사용률 (상위 10개)'
SELECT 
    schemaname || '.' || tablename as table_name,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY idx_scan DESC
LIMIT 10;

\echo ''
\echo '⚠️  사용되지 않는 인덱스 (scan = 0)'
SELECT 
    schemaname || '.' || tablename as table_name,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as wasted_size
FROM pg_stat_user_indexes
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- 5. 캐시 히트율
-- ============================================

\echo ''
\echo '🎯 캐시 히트율 (>90% 권장)'
SELECT 
    schemaname || '.' || tablename as table_name,
    heap_blks_read as disk_reads,
    heap_blks_hit as cache_hits,
    CASE 
        WHEN heap_blks_read + heap_blks_hit > 0 
        THEN round(heap_blks_hit * 100.0 / (heap_blks_read + heap_blks_hit), 2)
        ELSE 100 
    END as cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
  AND heap_blks_read + heap_blks_hit > 1000
ORDER BY cache_hit_ratio ASC
LIMIT 10;

-- ============================================
-- 6. 확장 및 설정 확인
-- ============================================

\echo ''
\echo '🔧 설치된 확장'
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto')
ORDER BY extname;

\echo ''
\echo '⚙️  중요 설정'
SELECT name, setting, unit, context
FROM pg_settings
WHERE name IN (
    'max_connections',
    'shared_buffers',
    'effective_cache_size',
    'maintenance_work_mem',
    'autovacuum',
    'autovacuum_naptime'
)
ORDER BY name;

-- ============================================
-- 7. 최근 VACUUM 이력
-- ============================================

\echo ''
\echo '🧹 최근 VACUUM 이력'
SELECT 
    schemaname || '.' || tablename as table_name,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    vacuum_count,
    autovacuum_count
FROM pg_stat_user_tables
WHERE schemaname IN ('auth', 'quiz', 'community', 'video_analysis', 'payment')
ORDER BY GREATEST(last_autovacuum, last_vacuum) DESC NULLS LAST
LIMIT 10;

-- ============================================
-- 완료
-- ============================================

\echo ''
\echo '✅ 모니터링 완료!'
\echo '📝 주의사항:'
\echo '  - Dead ratio > 20%: VACUUM 필요'
\echo '  - Cache hit ratio < 90%: 메모리 부족'
\echo '  - Unused indexes: 제거 고려'


-- ============================================
-- 고급 분석 쿼리
-- ============================================

-- 1. 실행 계획 분석
SELECT 
    schemaname,
    tablename,
    seq_scan,
    idx_scan,
    CASE 
        WHEN seq_scan + idx_scan = 0 THEN 0
        ELSE ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 2)
    END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY seq_scan_pct DESC;

-- 2. 느린 쿼리 (pg_stat_statements 필요)
SELECT 
    query,
    calls,
    mean_exec_time / 1000 AS mean_sec,
    max_exec_time / 1000 AS max_sec
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 3. 사용되지 않는 인덱스
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(indexrelid) DESC;
