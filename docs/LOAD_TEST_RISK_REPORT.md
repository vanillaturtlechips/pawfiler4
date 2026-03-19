# PawFiler 부하테스트 리스크 및 수정 현황 보고서

작성일: 2026-03-19

---

## 1. 인증 서비스 병목 우려 — 결론 먼저

> **auth 서비스는 부하테스트 시 병목이 되지 않습니다.**

### 근거: ALB Ingress 라우팅 구조

```
클라이언트 요청
  /api/auth/*              → auth-service:8084      (로그인/가입/갱신만)
  /api/quiz.QuizService/*  → quiz-service:8080       (직접 라우팅)
  /api/community.*/*       → community-service:8080  (직접 라우팅)
  /api/user.UserService/*  → user-service:8083       (직접 라우팅)
  /api/video_analysis.*/*  → video-analysis:8080     (직접 라우팅)
```

모든 API 요청은 ALB에서 각 서비스로 **직접 라우팅**됩니다.
auth 서비스는 `/api/auth/*` 경로만 처리하며, 퀴즈/커뮤니티/유저 API 호출 시
auth 서비스를 전혀 거치지 않습니다.

### JWT 검증 방식

- JWT는 HS256 방식으로 각 서비스가 **로컬에서 직접 검증**합니다.
- 단, 현재 quiz/community/user 서비스에 JWT 검증 미들웨어가 **구현되지 않았습니다.**
- auth 서비스가 발급한 토큰의 `user_id`를 그대로 신뢰하는 구조입니다.

### HPA 설정 현황

| 서비스 | minReplicas | maxReplicas | CPU 임계치 |
|--------|------------|-------------|-----------|
| auth | 1 | 4 | 60% |
| quiz | 1 | 10 | 70% |
| community | 1 | 10 | 70% |
| user | 1 | 10 | 70% |

auth는 로그인/가입만 처리하므로 max 4로도 충분합니다.

---

## 2. 실제 부하테스트 병목 예상 지점

### 2-1. RDS (최우선 위험)

**모든 서비스가 단일 RDS 인스턴스를 공유합니다.**

```
quiz-service     → RDS (quiz 스키마)
community-service → RDS (community 스키마)
user-service     → RDS (user_svc 스키마)
auth-service     → RDS (auth 스키마)
```

부하 증가 시나리오:
- quiz 트래픽 급증 → DB 커넥션 풀 점유 → community/user도 응답 지연
- 커넥션 풀 고갈 시 전체 서비스 503

현재 커넥션 풀 설정:
```go
// user-service (main.go)
db.SetMaxOpenConns(30)
db.SetMaxIdleConns(10)

// quiz-service
MaxOpenConns: 25 (추정)
```
4개 서비스 합산 최대 약 100~120개 커넥션 → RDS 인스턴스 타입에 따라 한계 도달 가능

### 2-2. community → user gRPC 호출 (댓글/게시글 작성마다)

`CreateComment`, `CreatePost` 시 매번 user-service gRPC 호출:
```go
nickname, avatarEmoji := h.userClient.GetProfile(ctx, req.UserId)
```
커뮤니티 동시 요청 100건 → user-service gRPC 100건 동시 발생

### 2-3. quiz → user AddRewards (퀴즈 답변마다)

퀴즈 제출 시 매번 user-service AddRewards 호출:
```
quiz 답변 → quiz-service → user-service.AddRewards → DB FOR UPDATE 트랜잭션
```
동시 퀴즈 트래픽 시 user-service가 직렬 처리 병목이 될 수 있음

### 2-4. video-analysis — latest 태그 문제

ArgoCD에서 video-analysis만 `latest` 태그를 사용 중.
배포 버전 추적 불가, 예상치 못한 버전이 실행 중일 수 있음.

---

## 3. 이번 세션에서 수정된 내용

### 3-1. 닉네임 "탐정" 고정 버그

**원인**: 회원가입 시 `user_svc.preferences` 초기화가 비동기 goroutine으로 처리되어 실패 시 닉네임이 '탐정'으로 고정

| 파일 | 수정 내용 |
|------|---------|
| `auth/internal/repository/user_repository.go` | `CreateUser`에 nickname 파라미터 추가, '탐정' 하드코딩 제거 |
| `auth/internal/handler/auth_handler.go` | 이메일 prefix를 직접 `CreateUser`에 전달, goroutine 3회 재시도 + 에러 로그 추가 |
| `user/grpc_handler.go` | `GetProfile` preferences INSERT 실패 시 로그 추가 |

**잔존 문제**: goroutine 3회 모두 실패 시 preferences 미초기화 가능성 존재.
근본 해결책(auth → DB 직접 쓰기)은 별도 논의 필요.

### 3-2. 닉네임/아바타 변경 후 커뮤니티 미반영 버그

**원인**: `UpdateProfile` 호출 시 `user_svc.preferences`만 업데이트되고
`community.posts`, `community.comments`의 `author_nickname/author_emoji`는 갱신 안 됨

| 파일 | 수정 내용 |
|------|---------|
| `user/grpc_handler.go` | `UpdateProfile` 완료 후 community posts/comments 비동기 동기화 추가 |
| `backend/scripts/migrate-perf-v2.sql` | `idx_comments_author_id` 인덱스 추가 |

### 3-3. 성능 최적화 (이전 세션)

| 파일 | 수정 내용 |
|------|---------|
| `community/handler/ranking.go` | 60초 in-memory 캐시 추가 |
| `community/handler/dashboard.go` | `ANY` → `@>` GIN 인덱스 활용 |
| `community/handler/post.go` | S3 삭제 goroutine 비동기 처리 |
| `community/handler/sync.go` | 닉네임 동기화 2 UPDATE → 트랜잭션 래핑 |
| `user/grpc_handler.go` | GetProfile 8쿼리 → 1쿼리 통합 |
| `user/grpc_handler.go` | UpdateProfile 사전 SELECT 제거 (UPSERT+RETURNING) |
| `quiz/gorm_repository.go` | GetQuestionById O(n) → O(1) map 인덱스 |
| `quiz/gorm_repository.go` | processBatch Redis 실패 시 DB fallback |

### 3-4. 데이터 버그 수정 (이전 세션)

| 파일 | 수정 내용 |
|------|---------|
| `community/handler/like.go` | `RowsAffected()` 에러 무시 수정 (좋아요 카운터 drift) |
| `community/handler/comment.go` | DeleteComment `FOR UPDATE` 추가 (이중 카운터 감소 방지) |
| `user/grpc_handler.go` | PurchaseItem ExecContext 에러 무시 수정 |
| `user/profile.go` | communityPosts/totalAnalysis 에러 로깅 추가 |

---

## 4. 부하테스트 시 예상 장애 시나리오

### 시나리오 A: 퀴즈 동시 접속 급증
```
100명 동시 퀴즈 답변
→ quiz-service pod 수평 확장 (HPA, max 10)
→ user-service.AddRewards 100건 동시
→ quiz.user_profiles FOR UPDATE 직렬화
→ 응답 지연 증가 (예상: 500ms~2s)
→ RDS 커넥션 경쟁
```
**예방책**: user-service HPA max 10 이지만 AddRewards가 직렬 트랜잭션이라 pod 증가 효과 제한적

### 시나리오 B: 커뮤니티 동시 게시글 작성
```
50명 동시 CreatePost
→ community-service → user-service.GetProfile 50건 동시 gRPC
→ user-service 부하 증가
→ GetProfile에서 preferences INSERT + SELECT (DB 2회)
→ RDS 부하 집중
```

### 시나리오 C: RDS 커넥션 풀 고갈
```
전체 서비스 동시 부하
→ 4개 서비스 합산 100+ 커넥션 요청
→ RDS max_connections 초과
→ "too many connections" 에러
→ 전체 서비스 503
```

---

## 5. 수정하지 않은 잔존 위험

| 항목 | 위험도 | 설명 |
|------|--------|------|
| JWT 검증 미들웨어 없음 | 🔴 높음 | quiz/community/user 서비스가 JWT를 검증하지 않음. user_id 위조 가능 |
| video-analysis `latest` 태그 | 🟡 중간 | ArgoCD 버전 추적 불가 |
| auth goroutine 3회 실패 | 🟡 중간 | 닉네임 미초기화 가능성 잔존 |
| RDS 단일 인스턴스 | 🔴 높음 | 모든 서비스 공유, 부하테스트 시 최우선 모니터링 대상 |
| community sync goroutine 실패 | 🟢 낮음 | 아바타 갱신 지연 가능, 서비스 영향 없음 |
| UpdatePost media_url 필수 검증 | 🟡 중간 | main 브랜치에서 추가됨, mun 브랜치 미반영 |

---

## 6. 부하테스트 전 권장 사항

1. **RDS 모니터링 필수**: CloudWatch에서 `DatabaseConnections`, `CPUUtilization` 실시간 확인
2. **migrate-perf-v2.sql 적용**: `idx_comments_author_id` 등 인덱스 미적용 상태
3. **video-analysis 이미지 태그 수정**: `latest` → 특정 SHA로 고정
4. **JWT 검증 미들웨어 추가**: 실서비스 전환 전 필수 (현재 보안 취약)
5. **mun 브랜치 → main 머지 후 CI/CD 확인**: ArgoCD 이미지 업데이트 정상 동작 확인
