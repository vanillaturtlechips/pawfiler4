# PawFiler4 프로젝트 전체 개요

> 최종 업데이트: 2026-03-19

---

## 1. 프로젝트 소개

**PawFiler4**는 딥페이크 탐지 교육 플랫폼이다. 사용자가 퀴즈를 통해 딥페이크 판별 능력을 키우고, 영상을 직접 업로드해 AI 분석을 받으며, 커뮤니티에서 결과를 공유할 수 있는 서비스다.

### 핵심 기능
| 기능 | 설명 |
|---|---|
| 딥페이크 퀴즈 | 영상/이미지 보고 진짜/가짜 판별, XP/코인 보상 |
| 영상 분석 | 사용자가 직접 영상 업로드 → AI 딥페이크 탐지 |
| 커뮤니티 | 게시글/댓글/좋아요/투표, 운영진 공지 |
| 상점 | 코인으로 아이템/구독권 구매 |
| 프로필/랭킹 | 탐정 등급, XP, 코인, 업적, 연속 달성 |
| ML 파이프라인 | 딥페이크 탐지 모델 학습 (설계 완료, 미구현) |

---

## 2. 기술 스택

### Frontend
- **React + TypeScript** (Vite)
- **Tailwind CSS**, framer-motion (애니메이션)
- **TanStack Query** (서버 상태 관리)
- **React Router v6**
- `lib/api.ts`, `lib/communityApi.ts` — 백엔드 통신 레이어

### Backend (마이크로서비스)
| 서비스 | 언어 | 프로토콜 | 포트 |
|---|---|---|---|
| auth | Go | HTTP (REST) | 8080 |
| user | Go | gRPC + gRPC-gateway | 50054 (gRPC) / 8083 (HTTP) |
| community | Go | gRPC + gRPC-gateway | 50053 (gRPC) / 8082 (HTTP) |
| quiz | Go | gRPC + gRPC-gateway | 50052 (gRPC) |
| report | Python (FastAPI) | HTTP | - |
| video-analysis | Python | HTTP | - |
| admin | Go | HTTP | - |

### Infrastructure
- **AWS EKS** (Kubernetes 클러스터)
- **Karpenter** (노드 자동 확장)
- **AWS RDS PostgreSQL** (단일 DB, 스키마별 서비스 분리)
- **AWS S3** (미디어 저장, 커뮤니티 업로드)
- **AWS Lambda** (리포트 서비스 마이그레이션 예정)
- **Terraform** (인프라 IaC)
- **ArgoCD** (GitOps 배포)
- **Envoy Gateway** (API 게이트웨이, gRPC-gateway)
- **GitHub Actions** (CI/CD — 변경된 서비스만 빌드/배포)

---

## 3. 데이터베이스 구조

단일 RDS PostgreSQL 인스턴스에 스키마로 서비스 경계 구분.

```
┌─────────────────────────────────────────────────────────┐
│ schema: auth          (Auth 서비스)                      │
│  └─ users             id, email, password_hash,          │
│                       nickname, avatar_emoji,            │
│                       subscription_type, coins,          │
│                       level, level_title, xp,            │
│                       created_at, updated_at             │
├─────────────────────────────────────────────────────────┤
│ schema: quiz          (Quiz 서비스)                      │
│  ├─ questions         id, type, media_type, media_url,   │
│  │                    difficulty, options[], correct_*,  │
│  │                    created_at, updated_at             │
│  ├─ user_answers      id, user_id, question_id,          │
│  │                    answer_data(JSONB), is_correct,    │
│  │                    xp_earned, coins_earned, answered_at│
│  ├─ user_stats        user_id(PK), total_answered,       │
│  │                    correct_count, current_streak,     │
│  │                    best_streak, lives, updated_at     │
│  └─ user_profiles     user_id(PK), nickname, avatar_emoji│
│                       total_exp, total_coins,            │
│                       current_tier, energy, max_energy,  │
│                       last_energy_refill, updated_at     │
├─────────────────────────────────────────────────────────┤
│ schema: community     (Community 서비스)                 │
│  ├─ posts             id, author_id, author_nickname,    │
│  │                    author_emoji, title, body, likes,  │
│  │                    comments, tags[], media_url,       │
│  │                    is_admin_post, is_correct,         │
│  │                    created_at, updated_at             │
│  ├─ comments          id, post_id(FK), author_id,        │
│  │                    author_nickname, author_emoji,     │
│  │                    content, created_at                │
│  ├─ likes             id, post_id(FK), user_id           │
│  │                    created_at [UNIQUE(post_id,user_id)]│
│  └─ post_votes        id, post_id(FK), user_id,          │
│                       vote(bool), created_at             │
│                       [UNIQUE(post_id,user_id)]          │
├─────────────────────────────────────────────────────────┤
│ schema: video_analysis (Video 서비스)                    │
│  ├─ tasks             id, user_id, video_url,            │
│  │                    status, created_at, updated_at     │
│  └─ results           id, task_id(FK UNIQUE), verdict,   │
│                       confidence_score,                  │
│                       manipulated_regions(JSONB),        │
│                       frame_samples_analyzed,            │
│                       model_version, processing_time_ms, │
│                       created_at                         │
├─────────────────────────────────────────────────────────┤
│ schema: user_svc      (User 서비스)                      │
│  ├─ preferences       user_id(PK), nickname,             │
│  │                    avatar_emoji, updated_at           │
│  ├─ shop_items        id(VARCHAR PK), name, description, │
│  │                    price, icon, badge, type,          │
│  │                    quantity, bonus, is_active,        │
│  │                    sort_order, created_at, updated_at │
│  └─ shop_purchases    id, user_id, item_id, item_name,   │
│                       item_type, coins_paid, purchased_at│
├─────────────────────────────────────────────────────────┤
│ schema: payment       (미구현/예정)                      │
│  ├─ subscriptions     id, user_id, plan_id, status,      │
│  │                    started_at, expires_at, created_at │
│  └─ transactions      id, user_id, subscription_id(FK), │
│                       amount, currency, status,          │
│                       payment_method, created_at         │
└─────────────────────────────────────────────────────────┘
```

### 알려진 데이터 구조 이슈
- **닉네임 이중 관리**: `auth.users.nickname` + `user_svc.preferences.nickname` + `quiz.user_profiles.nickname` — 3곳에 분산
- **커뮤니티 author_nickname 스냅샷**: 게시글/댓글 작성 시점의 닉네임을 복사 저장 (이후 닉네임 변경 반영 안 됨 — 의도된 설계)

---

## 4. 서비스 간 통신 구조

```
Frontend (React)
    │
    ▼
Envoy Gateway (API 게이트웨이)
    ├─▶ Auth Service (HTTP)          /api/auth/*
    ├─▶ Community Service (gRPC-GW)  /community.CommunityService/*
    ├─▶ User Service (gRPC-GW)       /user.UserService/*
    ├─▶ Quiz Service (gRPC-GW)       /quiz.*/*
    ├─▶ Report Service (HTTP)        /api/report/*
    └─▶ Video Analysis (HTTP)        /api/video/*

내부 서비스 간 통신 (gRPC):
    Community Service ──gRPC──▶ User Service  (닉네임/아바타 조회)
    Quiz Service      ──gRPC──▶ User Service  (XP/코인 보상 전달, 프로필 조회)
    Auth Service      ──HTTP──▶ User Service  (회원가입 시 초기 닉네임 설정)
```

### gRPC 통신 규칙 (gRPC-gateway v2)
- **요청 body**: snake_case 필드명 (`page_size`, `post_id`, `user_id`)
- **응답 body**: camelCase 필드명 (`pageSize`, `postId`, `userId`)
- 프론트엔드는 응답 파싱 시 `res.camelCase || res.snake_case` 패턴으로 fallback 처리

---

## 5. 인증/인가 흐름

```
1. 회원가입 (POST /api/auth/signup)
   └─▶ auth.users 생성 (이메일, 비밀번호 해시)
   └─▶ User Service에 초기 닉네임 설정 (동기, 3초 타임아웃)
   └─▶ JWT access token + refresh token 반환

2. 로그인 (POST /api/auth/login)
   └─▶ Redis 기반 rate limit (300회/분/IP)
   └─▶ JWT 반환

3. 토큰 사용
   └─▶ Frontend: Authorization: Bearer {token} 헤더에 포함
   └─▶ 현재 각 서비스가 독립 검증 없이 user_id 파라미터를 신뢰 (개선 필요)

⚠️ 현재 상태: mock 인증 사용 중 (LoginPage.tsx → mockLogin/mockSignup)
   실서비스 전환 전 JWT 서비스별 검증 미들웨어 추가 필요
```

---

## 6. 주요 버그 수정 이력

### 이번 세션에서 수정된 것들

| # | 문제 | 수정 파일 | 커밋 |
|---|---|---|---|
| 1 | 게시글/댓글 시간이 UTC로 표시 (`created_at::text` → 타임존 없는 문자열) | `community/handler/post.go`, `comment.go` | `9f5546b` |
| 2 | 피드 검색/페이지네이션 동작 안 함 (`pageSize` → `page_size` 등) | `communityApi.ts` | `d40de67` |
| 3 | 댓글 목록 빈 배열 반환 (`{ postId }` → `{ post_id: postId }`) | `communityApi.ts` | `d40de67` |
| 4 | 댓글 작성 필드 서버 미전달 (camelCase raw → snake_case 매핑) | `communityApi.ts` | `d40de67` |
| 5 | 회원가입 후 닉네임 미설정 race condition (goroutine → 동기 호출) | `auth/handler/auth_handler.go` | `afd12ca` |
| 6 | 퀴즈 보상(XP/코인) 전달 실패 시 무음 소실 (재시도 없음 → 3회 재시도) | `quiz/service/quiz_service.go` | `afd12ca` |

### mun 브랜치 병합으로 반영된 것들 (주요)

| # | 문제 | 수정 |
|---|---|---|
| 1 | Auth 스키마 미스매치 (nickname/avatar_emoji 컬럼 없음) | `auth/main.go` 스키마에 컬럼 추가 |
| 2 | 게시글 삭제 시 S3 실패가 삭제 차단 | S3 삭제 non-blocking 처리 |
| 3 | 닉네임 '탐정' 고정 버그 / 코인 증발 / 409 재시도 버그 | 전면 수정 |
| 4 | video-analysis `eval()` RCE 취약점 | 안전한 파싱 함수로 교체 |
| 5 | CORS wildcard `*` | `CORS_ALLOWED_ORIGINS` env var로 변경 |
| 6 | 좋아요 TOCTOU race condition | atomic `INSERT … ON CONFLICT` 로 변경 |
| 7 | 커뮤니티 작성자 닉네임 스푸핑 가능 | 서버에서 User gRPC로 강제 조회 |
| 8 | `AddRewards` 동시성 문제 | `SELECT FOR UPDATE` + 트랜잭션 |

---

## 7. remote main 업데이트 내용 (2026-03-19 기준)

remote main(`c81eedc`)에서 새로 추가된 파일:

### ML 파이프라인 (설계 완료, 미구현)
| 파일 | 내용 |
|---|---|
| `docs/ML_PIPELINE_DESIGN.md` | 딥페이크 탐지 ML 파이프라인 전체 설계 문서. 지도학습 다중분류(real/ai_generated/deepfake), celeb-df/wilddeepfake/aigvdbench 데이터셋 사용 |
| `docs/DATA_COLLECTION.md` | 학습 데이터 수집 경로 설계. 퀴즈 영상(가중치 1.0) / 영상분석 결과(3-트랙 분기) / 커뮤니티 업로드(관리자 검토 후) |
| `scripts/train.py` | PyTorch 기반 모델 학습 스크립트 (EfficientNet/ViT 백본) |
| `scripts/package_webdataset.py` | WebDataset 포맷으로 패키징 스크립트 |
| `preprocess_remaining.py` | 전처리 잔여 작업 스크립트 |
| `terraform/ml-training.tf` | ML 학습용 EC2 Spot 인스턴스 Terraform 모듈 |
| `terraform/webdataset-packaging.tf` | WebDataset 패키징용 인프라 |
| `terraform/spot-preprocessing.tf` | 수정: Spot 전처리 인스턴스 설정 |

---

## 8. 남아있는 알려진 이슈

### 실서비스 전환 전 반드시 처리
- **JWT 검증 미들웨어 부재**: Quiz, Community, User 서비스가 `user_id` 파라미터를 신뢰. 직접 API 호출로 다른 유저 위장 가능.

### 구조적 기술 부채
- **닉네임 3중 관리**: `auth.users` / `user_svc.preferences` / `quiz.user_profiles` 간 동기화 없음
- **서비스 디스커버리 없음**: gRPC 주소 하드코딩 (`user-service:50054`)
- **모든 timestamp가 TIMESTAMP (timezone 없음)**: 이번 세션에서 읽기는 수정했으나 컬럼 타입 자체는 `TIMESTAMPTZ`로 변경 필요

---

## 9. 프로젝트 디렉토리 구조

```
pawfiler4/
├── frontend/                   # React 프론트엔드
│   └── src/
│       ├── pages/              # 페이지 컴포넌트
│       ├── components/         # 공통 컴포넌트
│       ├── lib/
│       │   ├── api.ts          # User/Shop/Profile API
│       │   └── communityApi.ts # Community API
│       └── contexts/
│           └── AuthContext.tsx  # 인증 상태 관리
├── admin-frontend/             # S3 배포 관리자 프론트엔드 (별도)
├── backend/
│   ├── services/
│   │   ├── auth/               # Go: JWT 인증 서비스
│   │   ├── user/               # Go: 프로필/상점/보상
│   │   ├── community/          # Go: 게시글/댓글/좋아요
│   │   ├── quiz/               # Go: 퀴즈 로직
│   │   ├── report/             # Python: 통계 리포트
│   │   ├── video-analysis/     # Python: 딥페이크 분석
│   │   └── admin/              # Go: 관리자 API
│   ├── proto/                  # 공용 protobuf 정의
│   └── scripts/
│       └── init-db.sql         # DB 초기화 스키마
├── scripts/                    # ML 학습 스크립트
├── docs/                       # 설계 문서
├── terraform/                  # AWS 인프라 IaC
├── k8s/                        # Kubernetes 매니페스트
└── .github/workflows/
    └── ci-cd.yml               # 변경된 서비스만 빌드/배포
```
