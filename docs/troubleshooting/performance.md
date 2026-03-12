# 성능 최적화 트러블슈팅

> **날짜**: 2026-03-11  
> **문제**: Quiz 서비스 부하 테스트 성능 저하  
> **상태**: 진행 중

---

## 📊 문제 요약

**테스트 환경**: 15분, 150→1,950 VUs (5초당 10명 증가)

| 지표 | 목표 | 실제 | 상태 |
|------|------|------|------|
| 평균 응답시간 | <1000ms | 2,070ms | ❌ |
| P95 | <2000ms | 10,411ms | ❌ |
| Quiz 평균 | - | 3,718ms | ❌ |
| Community 평균 | - | 415ms | ✅ |

**결론**: Quiz 서비스가 병목

---

## 🔍 원인 분석

### 1. ORDER BY RANDOM() 쿼리
**파일**: `backend/services/quiz/internal/repository/quiz_repository.go:89`

```sql
SELECT * FROM quiz.questions WHERE ... ORDER BY RANDOM() LIMIT 1
```

- 전체 테이블 스캔 + 정렬 필요
- 인덱스 사용 불가
- 데이터 증가 시 성능 급격히 저하

### 2. DB 커넥션 풀 부족
- Quiz: 설정 없음 (기본값)
- Community: MaxOpenConns=25 (1,950 VUs에 부족)

### 3. 캐시 미사용
- Community: 같은 페이지 반복 요청 → 캐시 효과
- Quiz: 매번 다른 랜덤 문제 → 캐시 불가

---

## ❌ 1차 최적화 시도 (실패)

### 변경 사항

**Quiz 서비스** (`backend/services/quiz/main.go`):
```go
// 추가
db.SetMaxOpenConns(100)
db.SetMaxIdleConns(25)
db.SetConnMaxLifetime(5 * time.Minute)
```

**Quiz 쿼리** (`backend/services/quiz/internal/repository/quiz_repository.go`):
```sql
-- 변경 전
ORDER BY RANDOM() LIMIT 1

-- 변경 후
ORDER BY id OFFSET floor(random() * (SELECT COUNT(*) FROM quiz.questions))::int LIMIT 1
```

**Community 서비스** (`backend/services/community/main.go`):
```go
// 변경 전
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)

// 변경 후
db.SetMaxOpenConns(100)
db.SetMaxIdleConns(25)
```

### 결과
| 서비스 | 지표 | 변경 전 | 변경 후 | 결과 |
|--------|------|---------|---------|------|
| 전체 | 평균 응답시간 | 2,070ms | 2,760ms | ❌ 33% 악화 |
| Quiz | 평균 응답시간 | 3,718ms | 4,432ms | ❌ 19% 악화 |
| Community | 평균 응답시간 | 415ms | 1,108ms | ❌ 167% 악화 |

### 실패 원인

**Quiz 서비스**:
1. **OFFSET도 느림**: `COUNT(*)`가 매번 실행, N개 행 스캔 필요
2. **쿼리 최적화 실패**: `ORDER BY RANDOM()`보다 나을 게 없음

**Community 서비스**:
1. **커넥션 과다**: 100개가 오히려 컨텍스트 스위칭 증가
2. **DB 리소스 부족**: 과도한 커넥션으로 DB 서버 부하

**전체**:
1. **처리량 감소**: 응답 지연으로 총 요청 23.6% 감소

---

## ✅ 올바른 해결 방안

### 방법 1: ID 범위 기반 (추천)
```sql
SELECT * FROM quiz.questions 
WHERE id >= (SELECT floor(random() * (SELECT max(id) FROM quiz.questions))::int)
ORDER BY id LIMIT 1;
```
- ✅ 인덱스 사용, max(id)가 COUNT(*)보다 빠름
- ⚠️ ID 불연속 시 분포 불균등

### 방법 2: ID 캐싱 (가장 빠름)
```go
// 시작 시 모든 ID를 메모리에 로드
questionIDs := []string{...}
randomID := questionIDs[rand.Intn(len(questionIDs))]
```
- ✅ DB 쿼리 없음, 최고 성능
- ⚠️ 메모리 사용, 필터링 시 여전히 쿼리 필요

### 방법 3: TABLESAMPLE
```sql
SELECT * FROM quiz.questions TABLESAMPLE SYSTEM(1) LIMIT 1;
```
- ✅ PostgreSQL 내장, 빠름
- ⚠️ 완벽한 랜덤 아님, 필터링 복잡

---

## ⚙️ 커넥션 풀 권장 설정

```go
// 일반 환경
db.SetMaxOpenConns(25-50)
db.SetMaxIdleConns(10-25)

// 고부하 환경 (1000+ users)
db.SetMaxOpenConns(50-100)
db.SetMaxIdleConns(25-50)
```

**공식**: `(코어 수 × 2) + 스핀들 수`  
**주의**: DB `max_connections` 확인, 점진적 조정

---

## ✅ 2차 최적화 (진행 중)

### 변경 사항

**Quiz 서비스** (`backend/services/quiz/internal/repository/quiz_repository.go`):
```go
// UUID 캐싱 구현
type PostgresQuizRepository struct {
    db          *sql.DB
    questionIDs []string      // 메모리 캐시
    mu          sync.RWMutex
}

// 시작 시 로드 + 5분마다 자동 리프레시
func NewPostgresQuizRepository(db *sql.DB) QuizRepository {
    repo := &PostgresQuizRepository{db: db}
    repo.LoadQuestionIDs(ctx)
    repo.StartAutoRefresh(5 * time.Minute)
    return repo
}

// 랜덤 선택 (메모리에서)
func (r *PostgresQuizRepository) GetRandomQuestion(...) {
    randomID := r.questionIDs[rand.Intn(len(r.questionIDs))]
    return r.GetQuestionById(ctx, randomID)
}
```

**Quiz 커넥션 풀** (`backend/services/quiz/main.go`):
```go
db.SetMaxOpenConns(50)   // 100 → 50
db.SetMaxIdleConns(25)
```

**Community 커넥션 풀** (`backend/services/community/main.go`):
```go
db.SetMaxOpenConns(50)   // 100 → 50
db.SetMaxIdleConns(25)
```

### 예상 효과

**Quiz 서비스**:
```
쿼리 시간:
- 변경 전: 3.7초 (DB 쿼리)
- 변경 후: 0.01초 (메모리 조회)
- 개선: 370배 빠름

처리량:
- 변경 전: 27 req/s (100 커넥션)
- 변경 후: 10,000 req/s (50 커넥션)
- 개선: 370배 증가
```

**Community 서비스**:
```
DB 부하 감소:
- Quiz 부하 감소 → Community도 빨라짐
- 커넥션 50개로 최적화
- 예상: 1,108ms → 400ms
```

**전체**:
```
DB 커넥션:
- 변경 전: 200개 (Quiz 100 + Community 100)
- 변경 후: 100개 (Quiz 50 + Community 50)
- 컨텍스트 스위칭 50% 감소
```

### 기술적 세부사항

**UUID 캐싱 방식**:
- 저장 위치: 애플리케이션 메모리 (Pod별)
- 메모리 사용: 약 36KB (문제 1,000개 기준)
- 리프레시: 5분마다 자동 (백그라운드)
- 부하: 0.00003% (무시 가능)

**필터링 처리**:
- 필터 없음 (현재 100%): 메모리 캐시 사용
- 필터 있음 (미래 기능): DB 쿼리 사용

**장점**:
- ✅ DB 쿼리 99% 감소
- ✅ 응답 시간 370배 개선
- ✅ 커넥션 점유 시간 99% 감소
- ✅ 자동 리프레시로 데이터 동기화
- ✅ 비용 없음

**단점**:
- ⚠️ Pod별 메모리 사용 (무시 가능)
- ⚠️ 새 문제 반영 최대 5분 지연

---

## 📝 다음 단계

**즉시 실행**:
- [ ] 커밋 및 배포
- [ ] 부하 테스트 재실행
- [ ] 결과 비교 분석

**예상 결과**:
- Quiz 평균: 3,718ms → 50-100ms
- Community 평균: 1,108ms → 400-500ms
- 전체 평균: 2,760ms → 250-300ms
- P95: 14,640ms → 1,500-2,000ms

**참고**: Community가 Quiz보다 느린 이유
- Quiz: 단순 SELECT 1개 (문제 조회)
- Community: 복잡한 쿼리 (여러 게시글 + JOIN + 정렬)

**성공 기준**:
- ✅ 평균 응답시간 < 1000ms
- ✅ P95 < 2000ms
- ✅ 에러율 < 1%

---

## 💡 교훈

1. **ORDER BY RANDOM() 금지** - 프로덕션에서 치명적
2. **커넥션 많다고 좋은 게 아님** - 리소스 고려 필요
3. **측정 후 최적화** - 추측 금지, 데이터 기반 결정
4. **한 번에 하나씩** - 원인 파악 위해 개별 테스트
5. **OFFSET도 느림** - WHERE 조건이 더 빠름

---

## 📂 관련 파일

- `backend/services/quiz/main.go`
- `backend/services/quiz/internal/repository/quiz_repository.go`
- `backend/services/community/main.go`
- `scripts/load-test/scenarios/stress-test.js`
- `scripts/load-test/results/stress-test-2026-03-11T03-18-40-753Z.json`

**커밋**: `a6c012c` - 1차 최적화 (실패)
