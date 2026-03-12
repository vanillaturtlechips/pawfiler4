# Quiz 서비스 성능 최적화

**작성일**: 2026년 3월 11-12일  
**결과**: 응답 속도 97% 개선 (2초 → 0.05초)

---

## 🎯 최종 성과

| 지표 | 최적화 전 | 최적화 후 | 개선율 |
|------|-----------|-----------|--------|
| 평균 응답시간 | 2,070ms | **53ms** | 97% ↓ |
| P95 응답시간 | 10,411ms | **164ms** | 98% ↓ |
| 총 처리량 | 421,549개 | **1,153,621개** | 174% ↑ |
| Quiz 읽기 성공률 | 100% (느림) | **100%** (빠름) | ✅ |

---

## 📋 문제 원인

### 1. 비효율적인 랜덤 쿼리
```sql
-- 문제가 된 쿼리
SELECT * FROM quiz.questions 
WHERE difficulty = ? AND type = ? 
ORDER BY RANDOM() 
LIMIT 1;
```
- 매번 전체 테이블 스캔 + 정렬
- 11개 문제에 3.7초 소요
- 인덱스 사용 불가

### 2. 캐시 미활용
- 동일한 11개 문제를 매번 DB 조회
- 메모리 캐시 없음

---

## ✅ 해결 방법

### 1. 메모리 캐싱 (핵심 해결책)

**아이디어**: "DB를 아예 안 쓰자"

```go
// 서비스 시작 시 모든 문제를 메모리에 로드
type QuizRepository struct {
    questions []Question  // 11개 문제 전체 메모리 저장
    mu        sync.RWMutex
}

func (r *QuizRepository) GetRandomQuestion() *Question {
    r.mu.RLock()
    defer r.mu.RUnlock()
    
    // DB 접근 없이 메모리에서 즉시 반환
    idx := rand.Intn(len(r.questions))
    return &r.questions[idx]
}
```

**효과**:
- 응답시간: 3.7초 → **0.05초** (74배 빠름)
- DB 쿼리: **0개** (완전 제거)
- 성공률: **100%**

**자동 갱신**:
- 30초마다 DB에서 최신 문제 로드
- 새 문제 추가 시 자동 반영

### 2. 배치 처리 (쓰기 최적화)

```go
func (r *QuizRepository) SaveAnswer(answer UserAnswer) error {
    // 1. Redis 큐에 빠르게 저장
    r.redis.LPush("answer_queue", answer)
    
    // 2. 사용자에게 즉시 응답
    return nil
    
    // 3. 백그라운드 워커가 10개씩 배치 저장
}
```

**효과**:
- 사용자 요청: 4,000/초 → Redis 큐 즉시 저장
- 실제 DB 쓰기: 400/초 (10개씩 배치)
- DB 부하: 90% 감소

### 3. 커넥션 풀 최적화

**Quiz 서비스**:
```go
// DB 커넥션
sqlDB.SetMaxOpenConns(30)
sqlDB.SetMaxIdleConns(15)

// Redis 커넥션
redis.NewClient(&redis.Options{
    PoolSize:     30,
    MinIdleConns: 10,
})
```

**Community 서비스**:
```go
db.SetMaxOpenConns(30)  // 50 → 30
db.SetMaxIdleConns(15)
```

---

## 💡 핵심 교훈

1. **정적 데이터는 메모리 캐싱**: 자주 바뀌지 않는 데이터는 DB 조회 불필요
2. **비동기 처리**: 사용자 응답과 실제 처리 분리로 체감 성능 향상
3. **배치 처리**: 쓰기 작업을 모아서 처리하면 DB 부하 대폭 감소

---

## 🚧 남은 과제

### UpdateUserStats 배치 처리
- 현재: 4,000 UPDATE/초
- 개선 시: 400 UPDATE/초 (10배 감소)
- 상태: 나중에 고민

---

## 📊 부하 테스트 결과

**테스트 조건**:
- 기간: 10분
- 동시 사용자: 150명 → 1,000명

**결과**:
- 평균 응답시간: 2,070ms → **53ms**
- P95 응답시간: 10,411ms → **164ms**
- 총 처리량: 421,549개 → **1,153,621개**
- GetRandomQuestion: **100% 성공**
- SubmitAnswer: 36% 성공 (개선 필요)

---

## 🔧 기술 스택

- **ORM**: GORM
- **캐시**: Redis (비동기 큐)
- **메모리 사용량**: 55KB (11개 문제)
- **배포**: Kubernetes + ArgoCD
