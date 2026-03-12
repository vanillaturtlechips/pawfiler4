# PawFiler 데이터베이스 구조 (2026-03-12)

## 📊 전체 구조

### 스키마 (5개)
- `auth` - 사용자 인증
- `quiz` - 퀴즈 서비스
- `community` - 커뮤니티
- `video_analysis` - 영상 분석
- `payment` - 결제

### 테이블 (11개)
```
auth.users                    (1)
quiz.questions               (3)
quiz.user_answers
quiz.user_stats
community.posts              (3)
community.comments
community.likes
video_analysis.tasks         (2)
video_analysis.results
payment.subscriptions        (2)
payment.transactions
```

---

## 1. Auth Service (`auth` 스키마)

### `auth.users`
```sql
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    avatar_emoji VARCHAR(10) NOT NULL,
    subscription_type VARCHAR(20) DEFAULT 'free',
    coins INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    level_title VARCHAR(100) DEFAULT '초보 탐정',
    xp INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON auth.users(email);
```

**컬럼 설명**:
- `id`: 사용자 고유 ID (UUID)
- `email`: 이메일 (로그인 ID, UNIQUE)
- `password_hash`: 비밀번호 해시
- `nickname`: 닉네임
- `avatar_emoji`: 아바타 이모지
- `subscription_type`: 구독 타입 (free, premium 등)
- `coins`: 보유 코인
- `level`: 레벨
- `level_title`: 레벨 타이틀 (예: '초보 탐정')
- `xp`: 경험치

---

## 2. Quiz Service (`quiz` 스키마)

### `quiz.questions`
```sql
CREATE TYPE quiz.question_type AS ENUM (
    'multiple_choice', 
    'true_false', 
    'region_select', 
    'comparison'
);

CREATE TYPE quiz.media_type AS ENUM ('video', 'image');

CREATE TABLE quiz.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type quiz.question_type NOT NULL DEFAULT 'multiple_choice',
    media_type quiz.media_type NOT NULL DEFAULT 'video',
    media_url TEXT NOT NULL,
    thumbnail_emoji VARCHAR(10) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    category VARCHAR(100) DEFAULT 'deepfake-detection',
    explanation TEXT NOT NULL,
    
    -- Multiple Choice fields
    options TEXT[],
    correct_index INTEGER,
    
    -- True/False fields
    correct_answer BOOLEAN,
    
    -- Region Select fields
    correct_regions JSONB,
    tolerance INTEGER,
    
    -- Comparison fields
    comparison_media_url TEXT,
    correct_side VARCHAR(10),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_questions_type ON quiz.questions(type);
CREATE INDEX idx_questions_difficulty ON quiz.questions(difficulty);
```

**컬럼 설명**:
- `type`: 문제 유형 (객관식, OX, 영역선택, 비교)
- `media_type`: 미디어 타입 (video, image)
- `media_url`: 미디어 URL (S3/CloudFront)
- `thumbnail_emoji`: 썸네일 이모지
- `difficulty`: 난이도 (easy, medium, hard)
- `category`: 카테고리 (deepfake-detection, ai-generated-detection 등)
- `explanation`: 정답 설명
- `options`: 객관식 선택지 (TEXT 배열)
- `correct_index`: 객관식 정답 인덱스
- `correct_answer`: OX 정답
- `correct_regions`: 영역선택 정답 (JSONB)
- `tolerance`: 영역선택 허용 오차
- `comparison_media_url`: 비교 문제 두 번째 미디어
- `correct_side`: 비교 문제 정답 위치 (left/right)

### `quiz.user_answers`
```sql
CREATE TABLE quiz.user_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    question_id UUID NOT NULL,
    answer_data JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    xp_earned INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (question_id) REFERENCES quiz.questions(id)
);

CREATE INDEX idx_user_answers_user_id ON quiz.user_answers(user_id);
CREATE INDEX idx_user_answers_question_id ON quiz.user_answers(question_id);
```

**컬럼 설명**:
- `user_id`: 사용자 ID
- `question_id`: 문제 ID (FK)
- `answer_data`: 답변 데이터 (JSONB)
- `is_correct`: 정답 여부
- `xp_earned`: 획득 경험치
- `coins_earned`: 획득 코인

### `quiz.user_stats`
```sql
CREATE TABLE quiz.user_stats (
    user_id UUID PRIMARY KEY,
    total_answered INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    lives INTEGER DEFAULT 3,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**컬럼 설명**:
- `user_id`: 사용자 ID (PK)
- `total_answered`: 총 답변 수
- `correct_count`: 정답 수
- `current_streak`: 현재 연속 정답
- `best_streak`: 최고 연속 정답
- `lives`: 남은 생명

---

## 3. Community Service (`community` 스키마)

### `community.posts`
```sql
CREATE TABLE community.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id VARCHAR(255) NOT NULL,
    author_nickname VARCHAR(100) NOT NULL,
    author_emoji VARCHAR(10) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_posts_created_at ON community.posts(created_at DESC);
CREATE INDEX idx_posts_tags_gin ON community.posts USING GIN (tags);
```

**컬럼 설명**:
- `author_id`: 작성자 ID
- `author_nickname`: 작성자 닉네임
- `author_emoji`: 작성자 이모지
- `title`: 제목
- `body`: 본문
- `likes`: 좋아요 수 (집계)
- `comments`: 댓글 수 (집계)
- `tags`: 태그 (TEXT 배열, GIN 인덱스)

### `community.comments`
```sql
CREATE TABLE community.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    author_id VARCHAR(255) NOT NULL,
    author_nickname VARCHAR(100) NOT NULL,
    author_emoji VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (post_id) REFERENCES community.posts(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_post_id ON community.comments(post_id);
```

### `community.likes`
```sql
CREATE TABLE community.likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES community.posts(id) ON DELETE CASCADE
);

CREATE INDEX idx_likes_post_id ON community.likes(post_id);
```

**제약조건**:
- `UNIQUE(post_id, user_id)`: 한 사용자가 같은 게시글에 중복 좋아요 불가

---

## 4. Video Analysis Service (`video_analysis` 스키마)

### `video_analysis.tasks`
```sql
CREATE TABLE video_analysis.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    video_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'UPLOADING',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON video_analysis.tasks(user_id);
CREATE INDEX idx_tasks_status ON video_analysis.tasks(status);
```

**컬럼 설명**:
- `status`: 작업 상태 (UPLOADING, PROCESSING, COMPLETED, ERROR)

### `video_analysis.results`
```sql
CREATE TABLE video_analysis.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL UNIQUE,
    verdict VARCHAR(20) NOT NULL,
    confidence_score DECIMAL(5,4) NOT NULL,
    manipulated_regions JSONB,
    frame_samples_analyzed INTEGER NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (task_id) REFERENCES video_analysis.tasks(id) ON DELETE CASCADE
);
```

**컬럼 설명**:
- `task_id`: 작업 ID (FK, UNIQUE - 1:1 관계)
- `verdict`: 판정 (fake, real, uncertain)
- `confidence_score`: 신뢰도 (0.0000 ~ 1.0000)
- `manipulated_regions`: 조작 영역 (JSONB)
- `frame_samples_analyzed`: 분석한 프레임 수
- `model_version`: 모델 버전
- `processing_time_ms`: 처리 시간 (밀리초)

---

## 5. Payment Service (`payment` 스키마)

### `payment.subscriptions`
```sql
CREATE TABLE payment.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    plan_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON payment.subscriptions(user_id);
```

### `payment.transactions`
```sql
CREATE TABLE payment.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    subscription_id UUID,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KRW',
    status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (subscription_id) REFERENCES payment.subscriptions(id)
);

CREATE INDEX idx_transactions_user_id ON payment.transactions(user_id);
```

---

## 🔑 주요 인덱스 목록

### Auth
- `idx_users_email` (auth.users.email)

### Quiz
- `idx_user_answers_user_id` (quiz.user_answers.user_id)
- `idx_user_answers_question_id` (quiz.user_answers.question_id)
- `idx_questions_type` (quiz.questions.type)
- `idx_questions_difficulty` (quiz.questions.difficulty)

### Community
- `idx_posts_created_at` (community.posts.created_at DESC)
- `idx_posts_tags_gin` (community.posts.tags) - GIN 인덱스
- `idx_comments_post_id` (community.comments.post_id)
- `idx_likes_post_id` (community.likes.post_id)

### Video Analysis
- `idx_tasks_user_id` (video_analysis.tasks.user_id)
- `idx_tasks_status` (video_analysis.tasks.status)

### Payment
- `idx_subscriptions_user_id` (payment.subscriptions.user_id)
- `idx_transactions_user_id` (payment.transactions.user_id)

---

## 📈 샘플 데이터

### Quiz Questions (11개)
- 객관식 (multiple_choice): 4개
- OX (true_false): 4개
- 영역선택 (region_select): 2개
- 비교 (comparison): 1개

### Community Posts (3개)
- 공지사항: 1개
- 일반 게시글: 2개
- 댓글: 2개
- 좋아요: 2개

---

## 🔄 관계도

```
auth.users (1)
    ↓ (user_id)
quiz.user_answers (N)
    ↓ (question_id)
quiz.questions (1)

quiz.user_stats (1:1 with auth.users)

community.posts (1)
    ↓ (post_id)
community.comments (N)
community.likes (N)

video_analysis.tasks (1)
    ↓ (task_id)
video_analysis.results (1) - 1:1 관계

payment.subscriptions (1)
    ↓ (subscription_id)
payment.transactions (N)
```

---

## 💡 특이사항

1. **UUID 사용**: 모든 PK는 UUID (gen_random_uuid())
2. **ENUM 타입**: quiz.question_type, quiz.media_type
3. **JSONB 사용**: 
   - quiz.questions.correct_regions
   - quiz.user_answers.answer_data
   - video_analysis.results.manipulated_regions
4. **배열 타입**: 
   - quiz.questions.options (TEXT[])
   - community.posts.tags (TEXT[])
5. **GIN 인덱스**: community.posts.tags (배열 검색 최적화)
6. **CASCADE 삭제**: 
   - community.comments (post 삭제 시)
   - community.likes (post 삭제 시)
   - video_analysis.results (task 삭제 시)
7. **집계 컬럼**: 
   - community.posts.likes (실시간 집계)
   - community.posts.comments (실시간 집계)

---

## 🚀 다음 단계

### 추가 예정 (벡터 DB)
- `agent_core` 스키마 (AI 모델 시그니처, 멀티모달 임베딩)
- `quiz.user_skill_vectors` (사용자 학습 프로필)
- `community.post_embeddings` (게시글 의미 검색)

자세한 내용은 `.kiro/DB_OPTIMIZATION.md` 참고
