# PawFiler4 프로젝트 전체 개요

> 최종 업데이트: 2026-03-19

---

## 1. 프로젝트 소개

**PawFiler4**는 딥페이크 탐지 교육 플랫폼이다. 사용자가 퀴즈를 통해 딥페이크 판별 능력을 키우고, 영상을 직접 업로드해 AI 분석을 받으며, 커뮤니티에서 결과를 공유할 수 있는 서비스다.

### 핵심 기능
| 기능 | 설명 |
|---|---|
| 딥페이크 퀴즈 | 영상/이미지 보고 진짜/가짜 판별, XP/코인 보상, 에너지 소모 |
| 영상 분석 | 사용자가 직접 영상 업로드 → AI 딥페이크 탐지 (멀티모달: 시각/음성/립싱크) |
| 커뮤니티 | 게시글/댓글/좋아요/투표, 운영진 공지 |
| 상점 | 코인으로 아이템/구독권 구매 |
| 프로필/랭킹 | 탐정 등급(알→삼빡이→맹금닭→불사조), XP, 코인, 연속 달성 |
| ML 파이프라인 | 딥페이크 탐지 모델 학습 (설계 완료, 학습 진행 중) |

---

## 2. 기술 스택

### Frontend
- **React 18 + TypeScript** (Vite)
- **Tailwind CSS** + Shadcn UI (Radix UI 기반 컴포넌트)
- **framer-motion** (애니메이션)
- **TanStack Query** (서버 상태 관리)
- **React Router v6**
- **React Hook Form + Zod** (폼 검증)
- `lib/api.ts`, `lib/communityApi.ts` — 백엔드 통신 레이어

### Backend (마이크로서비스)
| 서비스 | 언어 | 프로토콜 | 포트 | 역할 |
|---|---|---|---|---|
| auth | Go 1.21 | HTTP (REST) | 8080 | JWT 발급/검증, 회원가입/로그인 |
| user | Go 1.24 | gRPC + gRPC-gateway | 50054 / 8083 | 프로필, 상점, 보상(XP/코인) |
| community | Go 1.25 | gRPC + gRPC-gateway | 50053 / 8082 | 게시글, 댓글, 좋아요, 랭킹 |
| quiz | Go 1.25 | gRPC + gRPC-gateway | 50052 / 8080 | 퀴즈 게임 엔진, 통계, 에너지 |
| video-analysis | Python 3 | HTTP + gRPC | 50055 | 멀티모달 딥페이크 탐지 |
| admin | Go 1.21 | HTTP (REST) | 8082 | 콘텐츠 관리 (퀴즈/상점 CRUD) |
| report | Python (FastAPI) | HTTP | 8090 | 사용자 통계 PDF 리포트 생성 |

### Infrastructure
- **AWS EKS** (Kubernetes 클러스터, ap-northeast-2)
- **Karpenter** (노드 자동 확장, Spot + On-Demand 혼합)
- **AWS RDS PostgreSQL 16** (단일 DB, db.t3.micro, 스키마별 서비스 분리)
- **AWS ElastiCache Redis 7** (세션 캐시, rate limiting, 배치 큐)
- **AWS S3** (미디어 저장, 커뮤니티 업로드, 프론트엔드 정적 파일)
- **AWS CloudFront** (CDN — S3 + API Gateway 앞단)
- **Terraform** (인프라 IaC, 12개 모듈)
- **ArgoCD** (GitOps 배포, Helm 차트)
- **Envoy Gateway** (API 게이트웨이 + gRPC-JSON 트랜스코딩)
- **GitHub Actions** (CI/CD — 변경된 서비스만 빌드/배포)
- **Prometheus + Grafana** (모니터링)

---

## 3. 데이터베이스 구조

단일 RDS PostgreSQL 16 인스턴스에 스키마로 서비스 경계 구분.

```
┌─────────────────────────────────────────────────────────┐
│ schema: auth          (Auth 서비스)                      │
│  └─ users             id(UUID PK), email(UNIQUE),        │
│                       password_hash, nickname,           │
│                       avatar_emoji, created_at(TIMESTAMPTZ)│
├─────────────────────────────────────────────────────────┤
│ schema: quiz          (Quiz 서비스)                      │
│  ├─ questions         id(UUID PK), type(ENUM), media_type│
│  │                    media_url, thumbnail_emoji,        │
│  │                    difficulty, category, explanation, │
│  │                    options(TEXT[]), correct_index,    │
│  │                    correct_answer(bool),              │
│  │                    correct_regions(JSONB),            │
│  │                    comparison_media_url, tolerance,   │
│  │                    created_at, updated_at             │
│  ├─ user_answers      id(UUID PK), user_id(UUID),        │
│  │                    question_id(FK→questions),         │
│  │                    answer_data(JSONB), is_correct,    │
│  │                    xp_earned, coins_earned, answered_at│
│  ├─ user_stats        user_id(UUID PK), total_answered,  │
│  │                    correct_count, current_streak,     │
│  │                    best_streak, lives, updated_at     │
│  └─ user_profiles     user_id(UUID PK), nickname,        │
│                       avatar_emoji, total_exp,           │
│                       total_coins(DEFAULT 500),          │
│                       current_tier, energy(DEFAULT 100), │
│                       max_energy(DEFAULT 100),           │
│                       last_energy_refill, updated_at     │
├─────────────────────────────────────────────────────────┤
│ schema: community     (Community 서비스)                 │
│  ├─ posts             id(UUID PK), author_id(VARCHAR),   │
│  │                    author_nickname, author_emoji,     │
│  │                    title, body, likes, comments,      │
│  │                    tags(TEXT[]) [GIN index],          │
│  │                    media_url, media_type,             │
│  │                    is_admin_post, is_correct,         │
│  │                    created_at, updated_at             │
│  ├─ comments          id(UUID PK), post_id(FK→posts),    │
│  │                    author_id, author_nickname,        │
│  │                    author_emoji, content, created_at  │
│  ├─ likes             id(UUID PK), post_id(FK), user_id  │
│  │                    created_at [UNIQUE(post_id,user_id)]│
│  └─ post_votes        id(UUID PK), post_id(FK), user_id  │
│                       vote(bool), created_at             │
│                       [UNIQUE(post_id,user_id)]          │
├─────────────────────────────────────────────────────────┤
│ schema: video_analysis (Video 서비스)                    │
│  ├─ tasks             id(UUID PK), user_id, video_url,   │
│  │                    status, created_at, updated_at     │
│  └─ results           id(UUID PK), task_id(FK UNIQUE),   │
│                       verdict, confidence_score,         │
│                       manipulated_regions(JSONB),        │
│                       frame_samples_analyzed,            │
│                       model_version, processing_time_ms, │
│                       created_at                         │
├─────────────────────────────────────────────────────────┤
│ schema: user_svc      (User 서비스)                      │
│  ├─ preferences       user_id(UUID PK), nickname,        │
│  │                    avatar_emoji, updated_at           │
│  ├─ shop_items        id(VARCHAR PK), name, description, │
│  │                    price, icon, badge, type,          │
│  │                    quantity, bonus, is_active,        │
│  │                    sort_order, created_at, updated_at │
│  └─ shop_purchases    id(UUID), user_id, item_id,        │
│                       item_name, item_type,              │
│                       coins_paid, purchased_at           │
├─────────────────────────────────────────────────────────┤
│ schema: payment       (구현 예정)                        │
│  ├─ subscriptions     id, user_id, plan_id, status,      │
│  │                    started_at, expires_at, created_at │
│  └─ transactions      id, user_id, subscription_id(FK), │
│                       amount, currency, status,          │
│                       payment_method, created_at         │
└─────────────────────────────────────────────────────────┘
```

### 데이터 구조 설계 결정
- **닉네임 3중 관리**: `auth.users.nickname` / `user_svc.preferences.nickname` / `quiz.user_profiles.nickname` — 진원지는 user_svc.preferences, auth는 가입 시점 스냅샷
- **커뮤니티 author_nickname 스냅샷**: 게시글/댓글 작성 시점의 닉네임을 복사 저장 (이후 닉네임 변경 시 `SyncAuthorNickname` RPC로 일괄 갱신)
- **UUID vs VARCHAR author_id**: community.posts.author_id가 VARCHAR 타입 (UUID를 문자열로 저장) — 표현식 인덱스 `(user_id::text)`로 크로스 스키마 JOIN 최적화

---

## 4. 서비스 간 통신 구조

```
Frontend (React)
    │
    ▼
CloudFront (CDN)
    │
    ▼
ALB Ingress
    │
    ▼
Envoy Gateway (gRPC-JSON 트랜스코딩)
    ├─▶ Auth Service (HTTP/REST)         /api/auth/*
    ├─▶ Community Service (gRPC-GW)      /community.CommunityService/*
    ├─▶ User Service (gRPC-GW)           /user.UserService/*
    ├─▶ Quiz Service (gRPC-GW)           /quiz.*/*
    ├─▶ Video Analysis Service (gRPC-GW) /video_analysis.*/*
    ├─▶ Report Service (HTTP)            /api/report/*
    └─▶ Admin Service (HTTP)             /admin/*

내부 서비스 간 통신 (gRPC):
    Community Service ──gRPC──▶ User Service  (닉네임/아바타 조회)
    Quiz Service      ──gRPC──▶ User Service  (XP/코인 보상 AddRewards)
    Auth Service      ──HTTP──▶ User Service  (회원가입 시 초기 닉네임 설정)
```

### gRPC-gateway 통신 규칙
- **요청 body**: snake_case 필드명 (`page_size`, `post_id`, `user_id`)
- **응답 body**: camelCase 필드명 (`pageSize`, `postId`, `userId`)
- 프론트엔드는 응답 파싱 시 `res.camelCase || res.snake_case` 패턴으로 fallback 처리

---

## 5. 인증/인가 흐름

```
1. 회원가입 (POST /api/auth/signup)
   └─▶ auth.users 생성 (이메일, bcrypt 비밀번호 해시)
   └─▶ User Service에 초기 닉네임 설정 (동기, 3초 타임아웃)
   └─▶ JWT access token (1시간) + refresh token (7일) 반환

2. 로그인 (POST /api/auth/login)
   └─▶ Redis rate limit (300회/분/IP)
   └─▶ JWT 반환

3. 토큰 사용
   └─▶ Frontend: Authorization: Bearer {token} 헤더에 포함
   └─▶ 현재 각 서비스가 user_id 파라미터를 신뢰 (JWT 검증 미들웨어 미구현)

⚠️ 실서비스 전환 전: 서비스별 JWT 검증 미들웨어 추가 필요
```

---

## 6. 핵심 비즈니스 로직

### 퀴즈 플로우
```
GetRandomQuestion
  └─▶ 에너지 잔량 확인 (< 5 → ResourceExhausted 에러)
  └─▶ 에너지 5 차감 (quiz.user_profiles 업데이트)
  └─▶ 메모리 캐시에서 랜덤 문제 반환 (DB 조회 없음)

SubmitAnswer
  └─▶ 메모리 캐시에서 문제 조회 (O(1) map lookup)
  └─▶ 정답 판별 (question type별 validator)
  └─▶ 보상 계산 (난이도별 XP/코인, 5연속 정답 시 +20 XP)
  └─▶ Redis Queue에 answer 저장 (즉시 응답, 비동기 배치 DB 저장)
  └─▶ ApplyAnswerRewards: 스트릭/통계 DB 업데이트 (FOR UPDATE 락)
  └─▶ User Service gRPC AddRewards 호출 (비동기, 3회 재시도)
  └─▶ SubmitResult 반환 (CurrentStreak 포함 → handler 추가 쿼리 불필요)
```

### 코인/XP 보상 구조
```
XP 보상 (난이도별):
  easy: 30 XP, 15 coins
  medium: 50 XP, 25 coins
  hard: 80 XP, 40 coins
  5연속 정답 보너스: +20 XP

티어 승급:
  알 (0 XP) → 삼빡이 (1,000 XP) → 맹금닭 (2,000 XP) → 불사조 (4,000 XP)
  각 티어 달성 시 XP 리셋
```

### Redis 배치 큐
```
SaveAnswer → Redis LPush (즉시 응답)
           → Incr counter
           → counter ≥ 10 → Publish 알림
Worker     → 알림 수신 → SetNX 락 획득
           → RPop 10건 → DB 배치 저장
           → 실패 시: Redis 재삽입, Redis도 실패 시 DB 직접 저장 (데이터 유실 방지)
```

---

## 7. DB 성능 최적화 이력

### 적용된 마이그레이션 (`backend/scripts/migrate-perf-v2.sql`)

| 항목 | 변경 | 효과 |
|---|---|---|
| pg_trgm + GIN 인덱스 | `title`, `body` ILIKE 검색 | full scan → index scan (~25x) |
| TIMESTAMP → TIMESTAMPTZ | 모든 테이블 timestamp 컬럼 | 타임존 버그 근원 제거 |
| 표현식 인덱스 `(user_id::text)` | UUID→VARCHAR 크로스 스키마 JOIN | 타입 캐스트로 인덱스 skip 방지 |
| 복합 인덱스 `(is_admin_post DESC, created_at DESC)` | GetFeed ORDER BY 최적화 | sort 연산 제거 |
| `idx_posts_author_id` | DISTINCT author_id 랭킹 쿼리 | full scan 방지 |
| Materialized View `community.ranking_snapshot` | 크로스 스키마 JOIN pre-compute | 랭킹 조회 1회성 |
| `idx_user_answers_recent_correct` (partial) | 최근 90일 답변 집계 | 불필요한 행 skip |

### 적용된 정리 마이그레이션 (`backend/scripts/migrate-cleanup-v1.sql`)

| 항목 | 변경 |
|---|---|
| auth.users ghost 컬럼 제거 | subscription_type, coins, level, level_title, xp, updated_at 삭제 |
| total_coins DEFAULT 수정 | 3000 → 500 (Go 코드와 일치) |
| user_answers → user_profiles FK 추가 | 고아 행 방지 |

### 코드 레벨 최적화

| 파일 | 변경 | 효과 |
|---|---|---|
| `community/handler/post.go` | S3 삭제를 트랜잭션 커밋 후 goroutine으로 이동 | row lock 유지 시간 1-3s → ~0ms |
| `community/handler/ranking.go` | 60초 in-memory 캐시 | 크로스 스키마 JOIN 완전 우회 |
| `community/handler/dashboard.go` | `ANY(tags)` → `tags @> ARRAY[...]` | GIN 인덱스 활용 |
| `community/handler/sync.go` | posts/comments UPDATE 트랜잭션 래핑 | 부분 업데이트 불일치 방지 |
| `quiz/repository/gorm_repository.go` | `questionIndex map[string]int` 추가 | GetQuestionById O(n) → O(1) |
| `quiz/repository/gorm_repository.go` | `ApplyAnswerRewards` FOR UPDATE 추가 | 동시 요청 lost-update 방지 |
| `quiz/repository/gorm_repository.go` | 배치 실패 시 DB 직접 저장 fallback | Redis 재삽입 실패 시 데이터 유실 방지 |
| `quiz/service/quiz_service.go` | `SubmitResult`에 `CurrentStreak` 포함 | handler 추가 GetUserStats DB 호출 제거 |
| `quiz/handler/quiz_handler.go` | GetUserStats 호출 제거, streak bonus 중복 가산 수정 | DB 왕복 1회 절감, 표시값 정확성 |
| `user/grpc_handler.go` | GetProfile: 8개 쿼리 → 1개 통합 | DB 왕복 8회 → 1회 |
| `user/grpc_handler.go` | UpdateProfile: 사전 SELECT 제거 (UPSERT+RETURNING) | DB 왕복 2회 → 1회 |
| `user/grpc_handler.go` | PurchaseItem: ExecContext 에러 무시 수정 | 조용한 데이터 손실 방지 |
| `community/handler/comment.go` | DeleteComment: FOR UPDATE 락 추가 | 동시 삭제 이중 카운터 감소 방지 |

---

## 8. 알려진 이슈 (잔존)

### 실서비스 전환 전 반드시 처리
- **JWT 검증 미들웨어 부재**: Quiz, Community, User 서비스가 `user_id` 파라미터를 신뢰. 직접 API 호출로 다른 유저 위장 가능.

### 구조적 기술 부채
- **서비스 디스커버리 없음**: gRPC 주소 하드코딩 (`user-service:50054`)
- **GetComments LIMIT 없음**: `community.comments` 조회 시 LIMIT 미적용 → 댓글이 매우 많은 게시글 메모리 부담 가능
- **stats_tracker.UpdateStats 락 없음**: 이 메서드는 현재 메인 플로우에서 호출되지 않으므로 당장은 무해. 추후 사용 시 FOR UPDATE 또는 DB 레벨 원자적 UPDATE로 전환 필요

### 적용 대기 중인 마이그레이션
- `backend/scripts/migrate-perf-v2.sql` — RDS에서 수동 실행 필요
- `backend/scripts/migrate-cleanup-v1.sql` — RDS에서 수동 실행 필요 (고아 행 정리 및 FK 추가)

---

## 9. 이전 버그 수정 이력

### 성능/정확성 이슈 수정 (이번 세션)
| # | 문제 | 파일 | 심각도 |
|---|---|---|---|
| 1 | PurchaseItem: 코인 차감/기록 실패를 조용히 무시 | `user/grpc_handler.go` | CRITICAL |
| 2 | SyncAuthorNickname: posts/comments 업데이트 중 하나 실패 시 불일치 | `community/handler/sync.go` | HIGH |
| 3 | GetProfile: 8개 별도 DB 쿼리 (N+1) | `user/grpc_handler.go` | HIGH |
| 4 | GetRanking: 매 요청마다 크로스 스키마 JOIN | `community/handler/ranking.go` | HIGH |
| 5 | GetQuestionById: O(n) 선형 탐색 | `quiz/repository/gorm_repository.go` | HIGH |
| 6 | ApplyAnswerRewards: 동시 요청 시 lost-update | `quiz/repository/gorm_repository.go` | MEDIUM |
| 7 | DeletePost: S3 삭제 동안 row lock 유지 (1-3초) | `community/handler/post.go` | MEDIUM |
| 8 | GetFeed: `ANY(tags)` GIN 인덱스 미활용 | `community/handler/dashboard.go` | MEDIUM |
| 9 | UpdateProfile: 업데이트 전 불필요한 SELECT | `user/grpc_handler.go` | LOW |
| 10 | SubmitAnswer: 이미 있는 스트릭을 위해 추가 GetUserStats 호출 | `quiz/handler/quiz_handler.go` | LOW |
| 11 | SubmitAnswer: streak bonus 표시값 중복 가산 | `quiz/handler/quiz_handler.go` | LOW |
| 12 | processBatch: Redis 재삽입 실패 시 답변 데이터 유실 | `quiz/repository/gorm_repository.go` | MEDIUM |
| 13 | DeleteComment: FOR UPDATE 없이 동시 삭제 시 카운터 이중 감소 | `community/handler/comment.go` | LOW |

### 이전 세션 수정 이력
| # | 문제 | 수정 |
|---|---|---|
| 1 | Auth 스키마 미스매치 (nickname/avatar_emoji 컬럼 없음) | `auth/main.go` 스키마에 컬럼 추가 |
| 2 | auth.users ghost 컬럼 (subscription_type, coins 등 미사용 7개) | `migrate-cleanup-v1.sql` |
| 3 | 게시글 삭제 시 S3 실패가 삭제 차단 | S3 삭제 non-blocking goroutine |
| 4 | video-analysis `eval()` RCE 취약점 | 안전한 파싱 함수로 교체 |
| 5 | CORS wildcard `*` | `CORS_ALLOWED_ORIGINS` env var로 변경 |
| 6 | 좋아요 TOCTOU race condition | atomic `INSERT … ON CONFLICT` |
| 7 | 커뮤니티 작성자 닉네임 스푸핑 가능 | 서버에서 User gRPC로 강제 조회 |
| 8 | `AddRewards` 동시성 문제 | `SELECT FOR UPDATE` + 트랜잭션 |
| 9 | 퀴즈 보상 실패 시 무음 소실 | 3회 재시도 |
| 10 | TIMESTAMP → TIMESTAMPTZ 마이그레이션 | `migrate-perf-v2.sql` |

---

## 10. 프로젝트 디렉토리 구조

```
pawfiler4/
├── frontend/                   # React 프론트엔드
│   └── src/
│       ├── pages/              # 페이지 컴포넌트
│       ├── components/         # 공통 컴포넌트
│       ├── lib/
│       │   ├── api.ts          # User/Shop/Profile/Quiz API
│       │   └── communityApi.ts # Community API
│       └── contexts/
│           └── AuthContext.tsx  # 인증 상태 관리
├── admin-frontend/             # 관리자 프론트엔드 (S3 배포)
├── backend/
│   ├── services/
│   │   ├── auth/               # Go: JWT 인증 서비스
│   │   ├── user/               # Go: 프로필/상점/보상
│   │   ├── community/          # Go: 게시글/댓글/좋아요
│   │   ├── quiz/               # Go: 퀴즈 로직 (GORM + Redis)
│   │   ├── report/             # Python: 통계 리포트
│   │   ├── video-analysis/     # Python: 멀티모달 딥페이크 분석
│   │   └── admin/              # Go: 관리자 API
│   ├── proto/                  # 공용 protobuf 정의
│   └── scripts/
│       ├── init-db.sql         # DB 초기화 스키마
│       ├── migrate-perf-v2.sql # 성능 마이그레이션 (RDS 수동 실행 필요)
│       └── migrate-cleanup-v1.sql # 구조 정리 마이그레이션 (RDS 수동 실행 필요)
├── docs/                       # 설계 문서
│   ├── PROJECT_OVERVIEW.md     # 이 문서
│   ├── DB_PERFORMANCE_ANALYSIS.md # DB 성능 분석 상세
│   ├── ARCHITECTURE.md         # 아키텍처 다이어그램
│   ├── ML_PIPELINE_DESIGN.md   # ML 파이프라인 설계
│   └── ...
├── scripts/                    # ML 학습 스크립트
├── terraform/                  # AWS 인프라 IaC (12개 모듈)
├── k8s/                        # Kubernetes 매니페스트
│   ├── envoy-config.yaml       # Envoy gRPC-JSON 트랜스코딩 설정
│   └── ...
└── .github/workflows/
    └── ci-cd.yml               # 변경된 서비스만 빌드/배포
```

---

## 11. 부하 테스트 병목 예상 포인트

### 현재 아키텍처 기준
| 엔드포인트 | 예상 병목 | 한계 요청/초 (추정) |
|---|---|---|
| `SubmitAnswer` | Redis LPush + 통계 DB (FOR UPDATE 직렬화) | ~500 rps |
| `GetFeed` (검색 없음) | PostgreSQL (인덱스 있음) | ~1,000 rps |
| `GetFeed` (ILIKE 검색) | pg_trgm GIN 인덱스 | ~300 rps |
| `GetRanking` | in-memory 캐시 (60초 TTL) | ~10,000 rps |
| `GetProfile` (user) | PostgreSQL 단일 쿼리 (scalar subqueries) | ~800 rps |
| `GetRandomQuestion` | in-memory 캐시 | ~5,000 rps |

### 단일 RDS 인스턴스 공유 문제
- 6개 서비스가 DB 커넥션 풀 공유 → 트래픽 급증 시 커넥션 경쟁
- 현재 db.t3.micro (최대 커넥션 ~100) → 프로덕션 전에 PgBouncer 또는 RDS Proxy 도입 권장

---

## 12. 인프라 비용 (월 추정)

| 항목 | 비용 |
|---|---|
| EKS 클러스터 | ~$73 |
| EC2 노드 (Spot + On-Demand) | ~$50 |
| RDS PostgreSQL (db.t3.micro) | ~$15 |
| NAT Gateway | ~$32 |
| S3 + CloudFront | ~$5-20 |
| **합계** | **~$175-230/월** |
