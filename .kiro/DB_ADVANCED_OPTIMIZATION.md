# DB 고급 최적화 분석

## 1. 쿼리 패턴 분석

### Community Service
```sql
-- GetFeed: CTE + Cross Join
WITH total AS (SELECT COUNT(*) FROM community.posts)
SELECT p.*, t.count 
FROM community.posts p, total t
ORDER BY p.created_at DESC
LIMIT $1 OFFSET $2;

-- GetPost: 단순 조회
SELECT * FROM community.posts WHERE id = $1;

-- CreatePost: 단순 INSERT
INSERT INTO community.posts (...) VALUES (...);
```

### Quiz Service
```sql
-- GetUserStats: 단순 조회 + Redis 캐시
SELECT * FROM quiz.user_stats WHERE user_id = $1;

-- GetQuestionById: 단순 조회
SELECT * FROM quiz.questions WHERE id = $1;
```

**특징**:
- ❌ JOIN 쿼리 없음
- ✅ 단순 SELECT/INSERT 위주
- ✅ Redis 캐시 활용 (user_stats)

## 2. 트랜잭션 격리 수준 최적화

### 현재 상태
```
PostgreSQL 기본: READ COMMITTED
```

### 서비스별 분석

#### Quiz Service
```go
// SubmitAnswer: 동시성 이슈 가능
// user_stats 업데이트 시 Lost Update 위험

// 문제 시나리오:
// T1: SELECT total_answered = 10
// T2: SELECT total_answered = 10
// T1: UPDATE total_answered = 11
// T2: UPDATE total_answered = 11 (Lost Update!)
```

**해결책**: REPEATABLE READ 또는 SELECT FOR UPDATE

#### Community Service
```go
// CreatePost/Comment: 단순 INSERT
// GetFeed: 읽기 전용

// READ COMMITTED 충분
```

### 권장 설정

```go
// Quiz Service - stats 업데이트
tx, _ := db.BeginTx(ctx, &sql.TxOptions{
    Isolation: sql.LevelRepeatableRead,
})

// 또는 비관적 락
db.QueryRowContext(ctx, `
    SELECT * FROM quiz.user_stats 
    WHERE user_id = $1 
    FOR UPDATE
`, userID)
```

## 3. Join 전략 최적화

### 현재 상황
- **JOIN 쿼리 없음** → Hash Join/Nested Loop 최적화 불필요

### 향후 벡터 DB 쿼리
```sql
-- 유사도 검색 (예상)
SELECT p.*, e.embedding <=> $1 AS distance
FROM community.posts p
JOIN community.post_embeddings e ON p.id = e.post_id
ORDER BY distance
LIMIT 10;
```

**최적화 전략**:
```sql
-- 1. EXPLAIN ANALYZE로 실행 계획 확인
EXPLAIN (ANALYZE, BUFFERS) 
SELECT ...;

-- 2. work_mem 조정 (Hash Join 성능)
SET work_mem = '256MB';  -- 세션별

-- 3. 인덱스 추가
CREATE INDEX idx_post_embeddings_post_id 
ON community.post_embeddings(post_id);
```

## 4. 인스턴스 클래스 업그레이드 분석

### 현재: db.t3.medium
```
vCPU: 2
RAM: 4GB
max_connections: 413
비용: ~$60/월
```

### 업그레이드 시나리오

#### 시나리오 1: 벡터 검색 부하 증가
```
문제: pgvector 연산 CPU 집약적
증상: CPU 사용률 > 80%

해결: db.t3.large
- vCPU: 2 → 2 (동일)
- RAM: 4GB → 8GB
- 비용: $60 → $120/월

효과: work_mem 증가 → Hash Join 성능 향상
```

#### 시나리오 2: 동시 접속 증가
```
문제: Connection pool 부족
증상: Connection timeout

해결: db.m5.large (범용)
- vCPU: 2
- RAM: 8GB
- max_connections: ~856
- 비용: ~$140/월

효과: 더 많은 연결 + 안정적 성능
```

#### 시나리오 3: 데이터 증가 (1년 후)
```
예상: 72GB/년 → 스토리지 부족

해결: 스토리지만 확장
- 20GB → 100GB
- 추가 비용: ~$10/월

인스턴스 업그레이드 불필요
```

### 업그레이드 기준

| 지표 | 임계값 | 조치 |
|------|--------|------|
| CPU 사용률 | > 70% (지속) | db.m5.large |
| 메모리 사용률 | > 80% | db.t3.large |
| Connection 사용률 | > 80% (330/413) | db.m5.large |
| 스토리지 사용률 | > 80% (16GB/20GB) | 스토리지 확장 |
| 쿼리 지연 | > 500ms (p95) | 인덱스 or 인스턴스 |

## 5. 실행 계획 분석 쿼리

```sql
-- 1. 현재 실행 중인 느린 쿼리
SELECT 
    pid,
    now() - query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;

-- 2. 가장 느린 쿼리 (pg_stat_statements 필요)
SELECT 
    query,
    calls,
    total_exec_time / 1000 AS total_sec,
    mean_exec_time / 1000 AS mean_sec,
    max_exec_time / 1000 AS max_sec
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 3. 인덱스 사용률
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(indexrelid) DESC;

-- 4. 테이블별 Sequential Scan 비율
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    CASE 
        WHEN seq_scan + idx_scan = 0 THEN 0
        ELSE ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 2)
    END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY seq_scan_pct DESC;
```

## 6. 실용적 최적화 우선순위

### 즉시 적용 (비용 0)
1. ✅ **Fillfactor 튜닝** (HOT 최적화)
2. ✅ **Autovacuum 튜닝** (빈번한 UPDATE 테이블)
3. ✅ **Trigram 인덱스** (검색 성능)
4. ⚠️ **트랜잭션 격리 수준** (Quiz stats 업데이트)

### 모니터링 후 적용
5. **pg_stat_statements 활성화** (느린 쿼리 추적)
6. **work_mem 조정** (벡터 검색 시)
7. **인덱스 추가** (실행 계획 분석 후)

### 부하 증가 시 고려
8. **Read Replica** (읽기 부하 분산)
9. **인스턴스 업그레이드** (CPU/메모리 부족 시)
10. **Connection Pooler** (PgBouncer - 연결 부족 시)

## 7. 코드 수정 제안

### Quiz Service - 동시성 제어

```go
// 현재: Lost Update 위험
func (r *GormQuizRepository) UpdateUserStats(ctx context.Context, stats *UserStats) error {
    return r.db.WithContext(ctx).
        Where("user_id = ?", stats.UserID).
        Updates(stats).Error
}

// 개선: 비관적 락
func (r *GormQuizRepository) UpdateUserStats(ctx context.Context, stats *UserStats) error {
    tx := r.db.WithContext(ctx).Begin()
    defer tx.Rollback()
    
    // SELECT FOR UPDATE
    var current GormUserStats
    if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
        Where("user_id = ?", stats.UserID).
        First(&current).Error; err != nil {
        return err
    }
    
    // 업데이트
    if err := tx.Where("user_id = ?", stats.UserID).
        Updates(stats).Error; err != nil {
        return err
    }
    
    return tx.Commit().Error
}
```

### Community Service - CTE 최적화

```go
// 현재: Cross Join (비효율)
WITH total AS (SELECT COUNT(*) FROM community.posts)
SELECT p.*, t.count FROM community.posts p, total t

// 개선: Window Function
SELECT 
    p.*,
    COUNT(*) OVER() AS total_count
FROM community.posts p
ORDER BY p.created_at DESC
LIMIT $1 OFFSET $2;
```

## 요약

| 최적화 | 효과 | 비용 | 우선순위 |
|--------|------|------|----------|
| Fillfactor | HOT 증가 | 0 | 🔥 즉시 |
| Autovacuum | Bloat 감소 | 0 | 🔥 즉시 |
| Trigram 인덱스 | 검색 10x | 0 | 🔥 즉시 |
| 격리 수준 | 동시성 안정 | 0 | ⚠️ 코드 수정 |
| Window Function | CTE 최적화 | 0 | ⚠️ 코드 수정 |
| pg_stat_statements | 모니터링 | 0 | 📊 설정 |
| 인스턴스 업그레이드 | 전반적 성능 | $$$ | ⏳ 부하 증가 시 |
