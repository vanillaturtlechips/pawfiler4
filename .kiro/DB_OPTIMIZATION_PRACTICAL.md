# PawFiler DB 최적화 전략 (실전)

## 🎯 현재 상태 분석

### Connection Pool 설정
```go
// Community Service
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(25)
db.SetConnMaxLifetime(5 * time.Minute)

// Quiz Service
sqlDB.SetMaxOpenConns(100)
sqlDB.SetMaxIdleConns(50)
sqlDB.SetConnMaxLifetime(time.Hour)
```

**문제점**:
- 서비스별로 설정이 다름 (일관성 없음)
- 실제 부하 측정 없이 임의 설정
- RDS db.t3.micro 스펙 고려 안 됨

---

## 📊 1. 트랜잭션 격리 수준 (Isolation Level)

### 현재 상태
```sql
-- PostgreSQL 기본값
SHOW default_transaction_isolation;
-- Result: read committed
```

### 서비스별 요구사항 분석

#### Quiz Service
```go
// 현재: 암묵적 READ COMMITTED
// 문제 상황:
// 1. 사용자가 동시에 같은 문제 제출
// 2. user_stats 업데이트 시 race condition

// 필요한 격리 수준: REPEATABLE READ
db.BeginTx(ctx, &sql.TxOptions{
    Isolation: sql.LevelRepeatableRead,
})
```

**시나리오**:
```
User submits answer:
1. Read user_stats (current_streak = 5)
2. Calculate new_streak = 6
3. Update user_stats

동시 요청 시:
- READ COMMITTED: Lost update 가능
- REPEATABLE READ: 안전
```

#### Community Service
```go
// 현재: 암묵적 READ COMMITTED
// 문제 상황:
// 1. 게시글 좋아요 수 집계
// 2. 댓글 수 집계

// 필요한 격리 수준: READ COMMITTED (충분)
// 이유: 좋아요/댓글 수는 eventual consistency 허용
```

#### Video Analysis Service
```go
// 현재: 단순 INSERT/UPDATE
// 필요한 격리 수준: READ COMMITTED (충분)
// 이유: 분석 결과는 단일 트랜잭션
```

### 최적화 전략

```sql
-- PostgreSQL 설정 (RDS Parameter Group)
-- 기본값 유지: read committed

-- 필요한 경우만 명시적으로 변경
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- critical operations
COMMIT;
```

---

## 🧹 2. VACUUM & HOT (Heap-Only Tuples)

### 현재 상태
```sql
-- RDS 기본 autovacuum 설정
SHOW autovacuum;  -- on
SHOW autovacuum_naptime;  -- 1min
```

### 문제 분석

#### 자주 업데이트되는 테이블
```sql
-- 1. quiz.user_stats (매 답변마다 업데이트)
UPDATE quiz.user_stats 
SET total_answered = total_answered + 1,
    current_streak = current_streak + 1
WHERE user_id = $1;

-- 2. community.posts (좋아요/댓글 수 집계)
UPDATE community.posts 
SET likes = likes + 1 
WHERE id = $1;
```

**문제**: 
- 빈번한 UPDATE → Dead tuples 증가
- HOT 최적화 실패 시 bloat 발생

### HOT 최적화 전략

#### 조건 1: Fillfactor 조정
```sql
-- user_stats: 자주 업데이트되는 테이블
ALTER TABLE quiz.user_stats 
SET (fillfactor = 70);

-- posts: 좋아요 수 업데이트
ALTER TABLE community.posts 
SET (fillfactor = 80);

-- 설명:
-- fillfactor = 70 → 페이지의 30%를 비워둠
-- UPDATE 시 같은 페이지에 새 버전 저장 (HOT)
-- 인덱스 업데이트 불필요 → 성능 향상
```

#### 조건 2: 인덱스 최소화
```sql
-- user_stats는 PK만 있음 (좋음)
-- posts는 created_at, tags 인덱스 (필요)
-- 추가 인덱스는 신중하게
```

### VACUUM 전략

```sql
-- 1. Autovacuum 튜닝 (자주 업데이트되는 테이블)
ALTER TABLE quiz.user_stats SET (
    autovacuum_vacuum_scale_factor = 0.05,  -- 5% 변경 시 vacuum
    autovacuum_vacuum_threshold = 50,
    autovacuum_analyze_scale_factor = 0.02  -- 2% 변경 시 analyze
);

ALTER TABLE community.posts SET (
    autovacuum_vacuum_scale_factor = 0.1,   -- 10% 변경 시
    autovacuum_vacuum_threshold = 100
);

-- 2. 수동 VACUUM (주간 유지보수)
-- RDS는 자동으로 하지만, 명시적 실행도 가능
VACUUM ANALYZE quiz.user_stats;
VACUUM ANALYZE community.posts;

-- 3. VACUUM FULL (긴급 시만)
-- 주의: 테이블 잠금 발생
-- VACUUM FULL quiz.user_stats;  -- 사용 자제
```

---

## 📈 3. Connection Pool 최적화

### RDS db.t3.micro 스펙
```
vCPU: 1
RAM: 1GB
max_connections: 87 (기본값)
```

### 계산식
```
총 연결 수 = (서비스 수 × MaxOpenConns) + 예비

현재:
- Quiz Service: 100
- Community Service: 50
- Admin Service: 50 (추정)
- Video Analysis: 10 (추정)
총: 210 연결 → RDS 한계(87) 초과! ❌
```

### 최적화된 설정

```go
// RDS db.t3.micro 기준
// 총 연결 수: 60 (여유 27)

// Quiz Service (가장 많이 사용)
sqlDB.SetMaxOpenConns(30)
sqlDB.SetMaxIdleConns(10)
sqlDB.SetConnMaxLifetime(5 * time.Minute)
sqlDB.SetConnMaxIdleTime(2 * time.Minute)

// Community Service
db.SetMaxOpenConns(20)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
db.SetConnMaxIdleTime(2 * time.Minute)

// Admin Service
db.SetMaxOpenConns(5)
db.SetMaxIdleConns(2)
db.SetConnMaxLifetime(5 * time.Minute)

// Video Analysis Service
db.SetMaxOpenConns(5)
db.SetMaxIdleConns(2)
db.SetConnMaxLifetime(5 * time.Minute)
```

**이유**:
- Quiz: 가장 빈번한 쿼리 (p95 < 200ms 요구)
- Community: 중간 빈도
- Admin/Video: 낮은 빈도
- 총 60 연결 (RDS 한계의 70%)

---

## 🔍 4. 쿼리 최적화

### 문제 쿼리 식별

```sql
-- Slow query 로깅 활성화 (RDS Parameter Group)
log_min_duration_statement = 1000  -- 1초 이상 쿼리 로깅

-- 실행 계획 분석
EXPLAIN ANALYZE 
SELECT * FROM community.posts 
WHERE tags && ARRAY['딥페이크'] 
ORDER BY created_at DESC 
LIMIT 20;
```

### N+1 쿼리 문제

```go
// 현재 (추정): N+1 문제 가능성
posts := getPosts()  // 1 query
for _, post := range posts {
    comments := getComments(post.ID)  // N queries
}

// 최적화: JOIN 또는 IN 절
SELECT p.*, 
       COUNT(c.id) as comment_count
FROM community.posts p
LEFT JOIN community.comments c ON p.id = c.post_id
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 20;
```

---

## 📊 5. 인덱스 전략 (재검토)

### 추가 필요한 인덱스 (최소한)

```sql
-- 1. Community 검색 최적화 (HIGH)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);

CREATE INDEX idx_posts_body_trgm 
ON community.posts USING gin(body gin_trgm_ops);

-- 2. User Stats 조회 (MEDIUM)
-- 이미 PK(user_id)로 충분

-- 3. User Answers 분석 (LOW)
CREATE INDEX idx_user_answers_user_correct 
ON quiz.user_answers(user_id, is_correct)
WHERE answered_at > NOW() - INTERVAL '30 days';  -- Partial index
```

### 불필요한 인덱스 제거

```sql
-- 사용되지 않는 인덱스 찾기
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 
  AND indexname NOT LIKE '%_pkey';

-- 사용 안 되면 제거
-- DROP INDEX IF EXISTS unused_index_name;
```

---

## 🎯 6. 모니터링 쿼리

### 연결 수 모니터링
```sql
-- 현재 연결 수
SELECT count(*) FROM pg_stat_activity;

-- 서비스별 연결 수
SELECT application_name, count(*) 
FROM pg_stat_activity 
GROUP BY application_name;

-- 유휴 연결
SELECT count(*) FROM pg_stat_activity 
WHERE state = 'idle';
```

### Bloat 모니터링
```sql
-- 테이블 bloat 확인
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
       n_dead_tup,
       n_live_tup,
       round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

### 느린 쿼리 모니터링
```sql
-- 가장 느린 쿼리 (pg_stat_statements 필요)
SELECT query, 
       calls, 
       mean_exec_time,
       max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 🚀 구현 우선순위

### Phase 1: 즉시 적용 (1일)
```sql
-- 1. Connection Pool 조정
-- 2. Fillfactor 설정
ALTER TABLE quiz.user_stats SET (fillfactor = 70);
ALTER TABLE community.posts SET (fillfactor = 80);

-- 3. Autovacuum 튜닝
ALTER TABLE quiz.user_stats SET (
    autovacuum_vacuum_scale_factor = 0.05
);

-- 4. Trigram 인덱스
CREATE INDEX idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);
```

### Phase 2: 모니터링 설정 (1일)
```
- CloudWatch 알람 설정
- Slow query 로깅
- 주간 리포트 자동화
```

### Phase 3: 지속적 최적화 (ongoing)
```
- 쿼리 실행 계획 분석
- 인덱스 사용률 체크
- Bloat 모니터링
```

---

## 💡 핵심 원칙

1. **측정 먼저**: 추측하지 말고 측정
2. **점진적 적용**: 한 번에 하나씩
3. **롤백 계획**: 항상 되돌릴 수 있게
4. **문서화**: 변경 사항 기록
5. **실용주의**: 과도한 최적화 지양

---

## 📈 예상 효과

### Connection Pool 최적화
- 연결 고갈 방지
- 안정성 향상

### HOT 최적화
- UPDATE 성능 20-30% 향상
- Bloat 감소

### Trigram 인덱스
- 검색 속도 10-100배 향상

### Autovacuum 튜닝
- Dead tuple 감소
- 쿼리 성능 유지
