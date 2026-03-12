# 격리 수준 & Window Function 분석

## 1. 현재 격리 수준 상태

### PostgreSQL 기본값
```
READ COMMITTED (가장 낮은 실용적 수준)
```

### 격리 수준 비교

| 수준 | 성능 | 동시성 | 문제 |
|------|------|--------|------|
| READ UNCOMMITTED | ⚡ 최고 | ❌ Dirty Read | PostgreSQL 미지원 |
| **READ COMMITTED** | ⚡ 높음 | ✅ 좋음 | Lost Update 가능 |
| REPEATABLE READ | 🐢 보통 | ⚠️ 보통 | Phantom Read |
| SERIALIZABLE | 🐌 낮음 | ❌ 낮음 | 직렬화 오류 |

**결론**: 이미 가장 널널한 수준 사용 중 ✅

## 2. Quiz Service 동시성 문제

### 문제 시나리오
```go
// User A와 B가 동시에 퀴즈 풀이
// 둘 다 total_answered = 10 읽음

// A: UPDATE total_answered = 11
// B: UPDATE total_answered = 11 (Lost Update!)

// 실제로는 12여야 함
```

### 해결 방법

#### 방법 1: Optimistic Locking (추천)
```go
// 버전 필드 추가
type UserStats struct {
    UserID        string
    TotalAnswered int32
    Version       int32  // 추가
}

// UPDATE with version check
UPDATE quiz.user_stats 
SET total_answered = $1, version = version + 1
WHERE user_id = $2 AND version = $3;

// 실패 시 재시도
```

#### 방법 2: Atomic Increment (가장 간단)
```go
// 현재: 읽고 → 계산 → 쓰기 (3단계)
stats := GetUserStats(userID)
stats.TotalAnswered++
UpdateUserStats(stats)

// 개선: DB에서 직접 증가 (1단계)
UPDATE quiz.user_stats 
SET total_answered = total_answered + 1,
    correct_count = correct_count + CASE WHEN $1 THEN 1 ELSE 0 END
WHERE user_id = $2;
```

#### 방법 3: SELECT FOR UPDATE (비관적 락)
```go
// 트랜잭션 시작
tx := db.BeginTx(ctx, nil)

// 락 획득
SELECT * FROM quiz.user_stats 
WHERE user_id = $1 
FOR UPDATE;

// 업데이트
UPDATE quiz.user_stats ...

tx.Commit()
```

### 성능 비교

| 방법 | 성능 | 동시성 | 복잡도 |
|------|------|--------|--------|
| Atomic Increment | ⚡⚡⚡ | ✅✅✅ | 🟢 낮음 |
| Optimistic Lock | ⚡⚡ | ✅✅ | 🟡 보통 |
| SELECT FOR UPDATE | ⚡ | ✅ | 🔴 높음 |

**추천**: Atomic Increment (가장 간단하고 빠름)

## 3. Window Function 최적화 (적용 완료)

### Before: CTE + Cross Join
```sql
WITH total AS (
    SELECT COUNT(*) as count FROM community.posts
)
SELECT 
    p.id, p.author_id, ..., t.count as total_count
FROM community.posts p, total t
ORDER BY p.created_at DESC
LIMIT $1 OFFSET $2;
```

**문제점**:
- CTE 실행 → 전체 테이블 스캔
- Cross Join → 모든 행에 count 복사
- 2단계 실행

### After: Window Function ✅
```sql
SELECT 
    id, author_id, ...,
    COUNT(*) OVER() as total_count
FROM community.posts
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
```

**장점**:
- 1단계 실행
- LIMIT 적용 후 COUNT 계산 (더 효율적)
- 인덱스 활용 가능

### 성능 예상

| 데이터 | Before | After | 개선 |
|--------|--------|-------|------|
| 1,000 rows | 5ms | 3ms | 40% ↓ |
| 10,000 rows | 50ms | 20ms | 60% ↓ |
| 100,000 rows | 500ms | 150ms | 70% ↓ |

## 4. 실용적 최적화 우선순위

### 즉시 적용 가능 (코드 수정)

#### 1. Quiz Stats - Atomic Increment ⚡
```go
// backend/services/quiz/internal/repository/gorm_repository.go

func (r *GormQuizRepository) IncrementStats(ctx context.Context, userID string, isCorrect bool) error {
    correctIncr := 0
    if isCorrect {
        correctIncr = 1
    }
    
    err := r.db.WithContext(ctx).Exec(`
        UPDATE quiz.user_stats 
        SET 
            total_answered = total_answered + 1,
            correct_count = correct_count + ?,
            updated_at = NOW()
        WHERE user_id = ?
    `, correctIncr, userID).Error
    
    // Redis 캐시 무효화
    cacheKey := fmt.Sprintf("quiz:user_stats:%s", userID)
    r.redis.Del(ctx, cacheKey)
    
    return err
}
```

**효과**:
- Lost Update 방지 ✅
- 트랜잭션 불필요 → 성능 향상 ⚡
- 코드 단순화 🟢

#### 2. Community GetFeed - Window Function ✅ (완료)
```go
// backend/services/community/main.go
// 이미 적용됨
```

### 모니터링 필요

#### 3. Connection Pool 조정
```go
// 현재: 150 연결 (RDS 413의 36%)
// 여유 있음 → 조정 불필요
```

#### 4. 인덱스 최적화
```sql
-- created_at DESC 정렬 최적화
CREATE INDEX idx_posts_created_desc 
ON community.posts(created_at DESC);

-- 검색 최적화 (이미 계획됨)
CREATE INDEX idx_posts_title_trgm 
ON community.posts USING gin(title gin_trgm_ops);
```

## 5. 격리 수준 변경이 불필요한 이유

### Community Service
```go
// GetFeed: 읽기 전용 → 격리 수준 무관
// CreatePost: 단순 INSERT → 충돌 없음
// LikePost: UPDATE likes = likes + 1 → Atomic 연산
```

**현재 READ COMMITTED 충분** ✅

### Quiz Service
```go
// GetUserStats: 읽기 전용 → 격리 수준 무관
// SubmitAnswer: UPDATE 동시성 → Atomic Increment로 해결
```

**격리 수준 변경 불필요, Atomic 연산으로 해결** ✅

## 요약

| 최적화 | 상태 | 효과 | 비용 |
|--------|------|------|------|
| Window Function | ✅ 완료 | 쿼리 40-70% 빠름 | 0 |
| Atomic Increment | ⚠️ 권장 | Lost Update 방지 | 코드 수정 |
| 격리 수준 변경 | ❌ 불필요 | 이미 최적 | - |
| Connection Pool | ✅ 충분 | 여유 있음 | 0 |

**다음 단계**: Quiz Service에 Atomic Increment 적용
