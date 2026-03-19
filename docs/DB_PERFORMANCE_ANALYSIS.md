# PawFiler DB 성능 분석 보고서

> 작성일: 2026-03-19
> 대상: PostgreSQL (AWS RDS) — 단일 인스턴스, 6개 스키마 공유

---

## 목차

1. [PostgreSQL 선택 근거](#1-postgresql-선택-근거)
2. [현재 PostgreSQL 장점 활용 현황](#2-현재-postgresql-장점-활용-현황)
3. [발견된 문제 및 수정 내역](#3-발견된-문제-및-수정-내역)
4. [추가 발견된 DB 구조 문제](#4-추가-발견된-db-구조-문제)
5. [성능 수치 비교](#5-성능-수치-비교)
6. [마이그레이션 적용 방법](#6-마이그레이션-적용-방법)

---

## 1. PostgreSQL 선택 근거

### 합당한가?

**합당하다.** PawFiler의 구조는 PostgreSQL의 핵심 강점을 직접적으로 활용한다.

| 이유 | 설명 |
|------|------|
| **멀티 스키마** | `auth`, `quiz`, `community`, `video_analysis`, `payment`, `user_svc` 6개 스키마를 단일 DB에서 관리. 서비스 간 크로스 스키마 JOIN이 가능하고 배포가 단순함 |
| **ACID 트랜잭션** | XP/코인 지급, 투표, 좋아요 등 정합성이 중요한 연산에 트랜잭션 보장 필수 |
| **JSONB** | `quiz.user_answers.answer_data`, `video_analysis.results.manipulated_regions`, `quiz.questions.correct_regions` 등 반정형 데이터를 인덱스와 함께 저장 |
| **배열 타입** | `community.posts.tags TEXT[]` — 태그 검색에 GIN 인덱스 적용 가능 |
| **Window Function** | `GetFeed`에서 `COUNT(*) OVER()`로 페이지 수와 데이터를 쿼리 1번에 처리 |
| **ENUM 타입** | `quiz.question_type`, `quiz.media_type` — 타입 안전성 보장 |

MySQL/MariaDB로 대체했다면 멀티 스키마 JOINu, JSONB 인덱싱, 배열 타입 모두 별도 처리가 필요했을 것이다.

---

## 2. 현재 PostgreSQL 장점 활용 현황

### 잘 활용하고 있는 부분 ✅

| 기능 | 사용 위치 | 코드/SQL |
|------|-----------|---------|
| GIN 인덱스 (배열) | `community.posts.tags` | `idx_posts_tags_gin USING GIN (tags)` |
| `RETURNING` | `UpdatePost` | `UPDATE ... RETURNING id, title, ...` |
| `COUNT(*) OVER()` | `GetFeed` | 페이지네이션 + 전체 수를 1회 쿼리로 처리 |
| `ON CONFLICT DO NOTHING` | 프로필 upsert | 동시 생성 경합 방지 |
| `FOR UPDATE` | 코인/통계 업데이트 | 동시성 제어 |
| `COALESCE`, `GREATEST` | 좋아요 카운터 | `GREATEST(likes - 1, 0)` 음수 방지 |
| `gen_random_uuid()` | 모든 PK | 애플리케이션 레벨 UUID 생성 불필요 |
| fillfactor 튜닝 | `optimize-db.sql` | `user_stats=70`, `posts=80` (HOT 최적화) |
| Autovacuum 튜닝 | `optimize-db.sql` | 고빈도 UPDATE 테이블에 공격적 vacuum |
| ENUM 타입 | `quiz.question_type` | 잘못된 값 삽입 원천 차단 |
| 크로스 스키마 JOIN | `ranking.go` | `community.posts ↔ quiz.user_profiles ↔ quiz.user_stats` |
| Partial Index | `optimize-db.sql` | 최근 30일 답변 인덱스 |

### 활용하지 못하던 부분 ❌ (이번 수정으로 일부 해소)

| 기능 | 상태 | 수정 여부 |
|------|------|-----------|
| `TIMESTAMPTZ` | `TIMESTAMP`(no tz)를 사용 → 타임존 버그 원인 | ✅ migrate-perf-v2.sql |
| pg_trgm | 정의만 있고 미적용 | ✅ migrate-perf-v2.sql |
| Materialized View | 랭킹 쿼리에 미사용 | ✅ migrate-perf-v2.sql |
| 복합 인덱스 부족 | `is_admin_post + created_at` 등 미비 | ✅ migrate-perf-v2.sql |
| `LISTEN/NOTIFY` | Redis pub/sub으로 대체 | 🔜 향후 검토 |

---

## 3. 발견된 문제 및 수정 내역

### 문제 1 — `DeletePost` 트랜잭션 내 S3 호출

**파일:** [community/internal/handler/post.go](../backend/services/community/internal/handler/post.go)

**원인:**
```
FOR UPDATE (row lock 획득)
  ↓
deleteMediaFromS3()  ← 외부 API 호출, 최대 1~3초 소요
  ↓
DELETE FROM posts
  ↓
COMMIT (row lock 해제)
```
`FOR UPDATE`로 획득한 row lock이 S3 API 응답까지 유지됨. S3 지연 = PostgreSQL lock 지연.
같은 게시글을 읽거나 수정하는 다른 요청이 이 동안 전부 대기.

**수정 후:**
```
FOR UPDATE (row lock 획득)
  ↓
DELETE FROM posts
  ↓
COMMIT (row lock 해제)  ← 즉시 해제
  ↓
go deleteMediaFromS3()  ← 비동기, lock과 무관
```

**기대 효과:**
- lock 유지 시간: S3 포함 1,000~3,000ms → DB 처리만 5~20ms
- 동시 삭제 처리량: ~5배 향상

---

### 문제 2 — `GetQuestionById` O(n) 선형 탐색

**파일:** [quiz/internal/repository/gorm_repository.go](../backend/services/quiz/internal/repository/gorm_repository.go)

**원인:**
```go
// 수정 전: 문제 수만큼 반복
for _, q := range r.questions {
    if q.ID == questionID {
        return &q, nil
    }
}
```
문제가 100개면 평균 50번, 1,000개면 평균 500번 비교.

`GetQuestionById`는 `SubmitAnswer`마다 호출되므로 퀴즈 제출 TPS 증가 시 직접 영향.

**수정 후:**
```go
// 수정 후: map lookup O(1)
if idx, ok := r.questionIndex[questionID]; ok {
    q := r.questions[idx]
    return &q, nil
}
```
`LoadQuestions` 시 `map[string]int` index를 함께 빌드. 30초마다 auto-refresh 시에도 동시에 갱신.

**기대 효과:**
- 탐색 시간: O(n) → O(1) (문제 1,000개 기준 ~500μs → ~100ns)
- `SubmitAnswer` 레이턴시 감소에 직접 기여

---

### 문제 3 — `GetRanking` (community) 매 요청 크로스 스키마 JOIN

**파일:** [community/internal/handler/ranking.go](../backend/services/community/internal/handler/ranking.go)

**원인:**
```sql
-- 매 요청마다 실행
SELECT DISTINCT author_id FROM community.posts      -- full scan
LEFT JOIN quiz.user_profiles ...                    -- cross-schema
LEFT JOIN quiz.user_stats ...                       -- cross-schema
ORDER BY correct_answers DESC LIMIT 20
```
캐싱 없음. 랭킹 페이지 동시 접속 시 동일 쿼리가 N번 실행.

**수정 후:**
```go
// 60초 인메모리 캐시
if h.rankingCache != nil && time.Now().Before(h.rankingCache.expiresAt) {
    return h.rankingCache.data, nil
}
// ... 쿼리 실행 후 캐시 저장 ...
h.rankingCache = &rankingCacheEntry{data: result, expiresAt: time.Now().Add(60 * time.Second)}
```

**기대 효과:**
- DB 쿼리 횟수: 초당 N번 → 분당 1번 (60배 감소)
- 랭킹 응답 시간: ~50ms (크로스 JOIN) → ~0.1ms (캐시 히트)

---

### 문제 4 — `TIMESTAMP` (no tz) 타임존 버그 (근본 수정)

**원인:**
```sql
-- 현재: 타임존 정보 없이 저장
created_at TIMESTAMP DEFAULT NOW()
-- PostgreSQL이 반환: "2024-03-15 09:00:00" (tz 없음)
-- JS의 new Date()가 로컬 타임(KST)으로 해석 → 9시간 오차
```

Go 코드에서 `.UTC().Format(RFC3339)` 우회 수정을 했지만, 스키마 자체가 문제.

**migrate-perf-v2.sql 적용 후:**
```sql
-- 모든 timestamp 컬럼 변환
created_at TIMESTAMPTZ DEFAULT NOW()
-- PostgreSQL이 반환: "2024-03-15T09:00:00Z" (UTC 명시)
-- Go 코드의 .UTC().Format() 없이도 정확한 타임존
```

---

## 4. 추가 발견된 DB 구조 문제

### 4-1. 타입 불일치로 인한 인덱스 미사용 (중간 위험)

`ranking.go`의 JOIN 조건:
```sql
quiz.user_profiles qp ON qp.user_id::text = p.author_id
```
`quiz.user_profiles.user_id`는 `UUID` 타입, `community.posts.author_id`는 `VARCHAR(255)`.
`::text` 캐스트가 들어가면 PostgreSQL이 인덱스를 사용하지 못하고 seq scan 발생.

**migrate-perf-v2.sql 대응:**
```sql
CREATE INDEX idx_quiz_profiles_user_id_text ON quiz.user_profiles ((user_id::text));
CREATE INDEX idx_quiz_stats_user_id_text    ON quiz.user_stats     ((user_id::text));
```
Expression Index를 생성해 캐스트 비용 제거.

---

### 4-2. `auth.users`의 유령 컬럼 (낮은 위험, 데이터 정합성)

```sql
-- auth.users에 존재하지만 실제로 업데이트되지 않는 컬럼
coins        INTEGER DEFAULT 0,
level        INTEGER DEFAULT 1,
level_title  VARCHAR(100) DEFAULT '초보 탐정',
xp           INTEGER DEFAULT 0
```
실제 XP/코인의 source of truth는 `quiz.user_profiles`. `auth.users`의 이 컬럼들은 가입 시 0으로 세팅되고 이후 갱신되지 않아 항상 초기값임. 읽는 코드가 있다면 잘못된 데이터를 반환하게 됨.

**권고:** 사용하지 않는다면 컬럼 제거 또는 `GENERATED ALWAYS AS`로 뷰 전환.

---

### 4-3. `quiz.user_answers.user_id`에 FOREIGN KEY 없음 (낮은 위험)

```sql
CREATE TABLE quiz.user_answers (
    user_id UUID NOT NULL,  -- FK 없음
    ...
);
```
탈퇴 사용자의 답변 기록이 남아 있어도 DB 레벨에서 감지 불가. 장기적으로 orphan 데이터 누적.

---

### 4-4. `community.posts.likes/comments` 카운터 드리프트 가능성

```sql
likes    INTEGER DEFAULT 0,
comments INTEGER DEFAULT 0
```
좋아요/댓글 카운터가 실제 `COUNT(*)` 결과와 다를 수 있음. 트랜잭션 중간에 서비스가 재시작되거나, 좋아요 INSERT 후 카운터 UPDATE 사이에 실패가 발생하면 카운터가 틀어짐. 현재 코드에서 두 작업은 같은 트랜잭션이므로 위험도는 낮지만 장기 운영 시 확인 권고.

**모니터링 쿼리:**
```sql
SELECT p.id, p.likes, COUNT(l.id) AS actual_likes
FROM community.posts p
LEFT JOIN community.likes l ON l.post_id = p.id
GROUP BY p.id, p.likes
HAVING p.likes != COUNT(l.id);
```

---

### 4-5. `GetQuestionStats` 풀 테이블 스캔 (낮은 위험)

```sql
-- questionID 없을 때: user_answers 전체 집계
SELECT question_id, COUNT(*), ...
FROM quiz.user_answers GROUP BY question_id
```
시간 필터 없는 전체 집계. `user_answers`가 수십만 건 쌓이면 느려짐. 어드민 기능이므로 현재는 낮은 위험이나, partial index로 최근 데이터 집계 시 성능 향상 가능.

---

### 4-6. `quiz.user_profiles.total_coins` 기본값 불일치

```sql
-- init-db.sql (DB 스키마)
total_coins INTEGER DEFAULT 3000

-- gorm_repository.go (Go 코드)
TotalCoins: 500,  // 신규 계정 웰컴 보너스
```
DB 기본값과 Go 코드 기본값이 다름. Go 코드를 통해 생성하면 500, DB에 직접 INSERT하면 3000.

---

## 5. 성능 수치 비교

> 아래 수치는 posts 10,000건, user 1,000명, questions 500개 기준 추정치

### API별 예상 레이턴시

| API | 수정 전 | 수정 후 | 개선 배율 |
|-----|---------|---------|-----------|
| `DeletePost` (미디어 포함) | 1,200~3,500ms | 20~50ms | **~60x** |
| `GetRanking` (캐시 히트) | 50~150ms | 0.1~0.5ms | **~300x** |
| `GetRanking` (캐시 미스) | 50~150ms | 50~150ms | 1x (동일) |
| `GetFeed` 검색 (pg_trgm 적용 후) | 50~200ms | 2~10ms | **~25x** |
| `GetQuestionById` (1,000문제) | ~0.5ms | ~0.001ms | **~500x** |
| `SubmitAnswer` (end-to-end) | 15~30ms | 10~20ms | ~1.5x |

### DB 쿼리 횟수 감소

| 시나리오 | 수정 전 | 수정 후 |
|----------|---------|---------|
| 랭킹 100 rps | DB 쿼리 100/s | DB 쿼리 1/min |
| 검색 100 rps | Full scan 100/s | GIN index scan 100/s |
| 퀴즈 제출 1,000 rps | O(n) × 1,000 | O(1) × 1,000 |

---

## 6. 마이그레이션 적용 방법

### 사전 준비

```bash
# RDS 스냅샷 생성 (롤백 대비)
aws rds create-db-snapshot \
  --db-instance-identifier pawfiler-db \
  --db-snapshot-identifier pawfiler-pre-perf-v2

# 스냅샷 완료 확인
aws rds describe-db-snapshots \
  --db-snapshot-identifier pawfiler-pre-perf-v2 \
  --query 'DBSnapshots[0].Status'
```

### 적용

```bash
# 1. psql로 실행 (주의: BEGIN/COMMIT 포함됨)
psql $DATABASE_URL -f backend/scripts/migrate-perf-v2.sql

# 2. Materialized View 초기 데이터 채우기
psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW community.ranking_snapshot;"

# 3. 인덱스 생성 확인
psql $DATABASE_URL -c "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname IN ('community', 'quiz')
  AND indexname LIKE 'idx_%'
  ORDER BY indexname;
"
```

### 적용 후 검증

```sql
-- TIMESTAMPTZ 변환 확인
SELECT pg_typeof(created_at) FROM community.posts LIMIT 1;
-- 결과: "timestamp with time zone"

-- pg_trgm 인덱스 사용 확인
EXPLAIN SELECT * FROM community.posts WHERE title ILIKE '%고양이%';
-- 결과에 "Bitmap Index Scan on idx_posts_title_trgm" 확인

-- Materialized View 확인
SELECT COUNT(*) FROM community.ranking_snapshot;
```

### Materialized View 주기적 갱신 (pg_cron 사용 시)

```sql
-- pg_cron 확장 활성화 (RDS에서 지원)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매 2분마다 랭킹 갱신 (CONCURRENTLY: 조회 차단 없이 갱신)
SELECT cron.schedule(
  'refresh-ranking-snapshot',
  '*/2 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY community.ranking_snapshot;'
);
```

pg_cron 미사용 시 애플리케이션의 60초 인메모리 캐시가 대신 동작하므로 필수는 아님.
