-- Auth Service Schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

-- auth.users: 인증 전용 최소 스키마
-- coins/xp/level은 quiz.user_profiles가 source of truth — 중복 제거
-- subscription_type은 payment.subscriptions가 관리
CREATE TABLE auth.users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname      VARCHAR(100) NOT NULL DEFAULT '탐정',
    avatar_emoji  VARCHAR(10)  NOT NULL DEFAULT '🦊',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON auth.users(email);

-- Quiz Service Schema
CREATE SCHEMA IF NOT EXISTS quiz;

CREATE TYPE quiz.question_type AS ENUM ('multiple_choice', 'true_false', 'region_select', 'comparison');
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

CREATE TABLE quiz.user_stats (
    user_id UUID PRIMARY KEY,
    total_answered INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    lives INTEGER DEFAULT 3,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE quiz.user_profiles (
    user_id UUID PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL DEFAULT '탐정',
    avatar_emoji VARCHAR(10) NOT NULL DEFAULT '🥚',
    total_exp INTEGER DEFAULT 0,
    total_coins INTEGER DEFAULT 500,  -- 신규 계정 웰컴 보너스 (Go 코드와 일치)
    current_tier VARCHAR(50) DEFAULT '알',
    energy INTEGER DEFAULT 100,
    max_energy INTEGER DEFAULT 100,
    last_energy_refill TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_answers_user_id ON quiz.user_answers(user_id);
CREATE INDEX idx_user_answers_question_id ON quiz.user_answers(question_id);
CREATE INDEX idx_questions_type ON quiz.questions(type);
CREATE INDEX idx_questions_difficulty ON quiz.questions(difficulty);

-- Community Service Schema
CREATE SCHEMA IF NOT EXISTS community;

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
    media_url TEXT,
    media_type VARCHAR(10) CHECK (media_type IN ('image', 'video')),
    is_admin_post BOOLEAN DEFAULT FALSE,
    is_correct BOOLEAN DEFAULT NULL,
    true_votes INTEGER NOT NULL DEFAULT 0,
    false_votes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE community.post_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    vote BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES community.posts(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin ON community.posts USING GIN (tags);

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

CREATE TABLE community.likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES community.posts(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_created_at ON community.posts(created_at DESC);
CREATE INDEX idx_comments_post_id ON community.comments(post_id);
CREATE INDEX idx_likes_post_id ON community.likes(post_id);
CREATE INDEX idx_post_votes_post_id ON community.post_votes(post_id);

-- Video Analysis Service Schema
CREATE SCHEMA IF NOT EXISTS video_analysis;

CREATE TABLE video_analysis.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    video_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'UPLOADING',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX idx_tasks_user_id ON video_analysis.tasks(user_id);
CREATE INDEX idx_tasks_status ON video_analysis.tasks(status);

-- Payment Service Schema
CREATE SCHEMA IF NOT EXISTS payment;

CREATE TABLE payment.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    plan_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX idx_subscriptions_user_id ON payment.subscriptions(user_id);
CREATE INDEX idx_transactions_user_id ON payment.transactions(user_id);

-- User Service Schema
CREATE SCHEMA IF NOT EXISTS user_svc;

CREATE TABLE user_svc.preferences (
    user_id UUID PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL DEFAULT '탐정',
    avatar_emoji VARCHAR(10) NOT NULL DEFAULT '🦊',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_svc.shop_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    item_id VARCHAR(100) NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    coins_paid INTEGER NOT NULL DEFAULT 0,
    purchased_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shop_purchases_user_id ON user_svc.shop_purchases(user_id);

CREATE TABLE user_svc.shop_items (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    icon VARCHAR(10) NOT NULL DEFAULT '🎁',
    badge VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    bonus INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO user_svc.shop_items (id, name, description, price, icon, badge, type, quantity, bonus, sort_order) VALUES
  ('premium-monthly', '프리미엄 월간', '무제한 퀴즈 + 영상 분석', 9900, '👑', '인기', 'subscription', 0, 0, 1),
  ('premium-yearly', '프리미엄 연간', '12개월 + 2개월 무료', 99000, '💎', '최고가치', 'subscription', 0, 0, 2),
  ('coins-100', '소량 코인', '기본 코인 팩', 1000, '💰', NULL, 'coins', 100, 0, 1),
  ('coins-500', '중량 코인', '+50 보너스', 4500, '💰', '보너스', 'coins', 500, 50, 2),
  ('coins-1000', '대량 코인', '+150 보너스', 8500, '💎', '인기', 'coins', 1000, 150, 3),
  ('daily-package', '일일오픽 패키지', '퀴즈 5회 + 분석 1회', 250, '📝', '신규', 'item', 0, 0, 1),
  ('growth-package', '성급육성 패키지', 'XP 부스트 + 코인', 600, '⭐', '신규', 'item', 0, 0, 2),
  ('random-package', '만신전 패키지', '랜덤 아이템 3개', 300, '🎲', NULL, 'item', 0, 0, 3),
  ('color-package', '염색 세트 패키지', '아바타 커스터마이징', 500, '🎨', NULL, 'item', 0, 0, 4),
  ('costume-package', '코스튬권 패키지', '특별 의상 획득', 800, '👔', NULL, 'item', 0, 0, 5),
  ('gem-package', '금화 패키지', '프리미엄 재화', 1200, '💎', '한정', 'item', 0, 0, 6),
  ('special-package', '특파 재료 패키지', '희귀 아이템', 450, '🔮', NULL, 'item', 0, 0, 7);

-- Insert sample quiz questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'multiple_choice', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/deepfake_easy_001.jpg', '🎬', 'easy', 'ai-generated-detection', '오른쪽 위 보드의 글씨가 깨지고 왜곡된 것이 AI 생성 이미지의 특징입니다!', '{"얼굴 표정이 부자연스러워요","배경 글씨가 깨져있어요","조명이 완벽해요","그림자가 정확해요"}', 1, NULL, NULL, NULL, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440003', 'multiple_choice', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/deepfake_easy_001.jpg', '🖼️', 'easy', 'ai-generated-detection', 'AI가 생성한 이미지는 텍스트나 작은 디테일을 제대로 표현하지 못하는 경우가 많습니다.', '{"인물의 포즈가 자연스러워요","배경의 텍스트가 왜곡되어있어요","그림자가 정확해요","색감이 일치해요"}', 1, NULL, NULL, NULL, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440004', 'true_false', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/deepfake_easy_001.jpg', '✅', 'easy', 'ai-generated-detection', '이 이미지는 AI가 생성한 가짜입니다. 오른쪽 위 보드의 글씨가 깨지고 왜곡되어 있습니다.', NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440006', 'region_select', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/deepfake_easy_001.jpg', '👁️', 'easy', 'ai-generated-detection', '오른쪽 위 보드의 글씨가 깨지고 왜곡된 부분이 AI 생성 이미지의 증거입니다.', NULL, NULL, NULL, '[{"x": 650, "y": 150, "radius": 80}]', 50, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440007', 'region_select', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/deepfake_easy_001.jpg', '👄', 'easy', 'ai-generated-detection', '배경의 텍스트 왜곡은 AI가 생성한 이미지에서 자주 발견되는 특징입니다.', NULL, NULL, NULL, '[{"x": 650, "y": 150, "radius": 80}]', 50, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440008', 'comparison', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/images/deepfake/compare_left_001.jpg', '🔄', 'hard', 'ai-generated-detection', 'AI 생성 이미지는 바닥에 비친 그림자가 날개의 전체적인 형태만 덩어리로 표현되어 있습니다. 실제로는 깃털 사이로 빛이 새어나오거나 깃털 끝부분의 형태가 반영되어야 하지만 매우 단순화되어 있습니다. 또한 발톱의 개수나 모양이 불분명하고, 깃털이 뼈대에 붙는 구조가 부자연스럽습니다.', NULL, NULL, NULL, NULL, NULL, 'https://YOUR_CLOUDFRONT_DOMAIN/images/real/compare_right_001.jpg', 'left', '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('0f44e753-e6ef-4561-8313-4c3724ac0ade', 'true_false', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/ai-generated-detection/image/easy/7bd1f62b-3195-43e3-9fe7-adb40064d7b5.jpeg', '🎯', 'easy', 'ai-generated-detection', '곰의 털 질감이 실제 동물의 것과는 다르게 뭉쳐 보이거나 어색하며, UFC 로고의 형태가 일그러져 주변 배경과 조화롭지 못한 점은 AI가 만든 이미지에서 흔히 나타나는 특징입니다.', NULL, NULL, false, 'null', NULL, NULL, NULL, '2026-03-05 02:38:36.540518', '2026-03-05 02:38:36.540518');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('589802c8-4636-487e-800f-e36da4ffd116', 'true_false', 'image', 'https://YOUR_CLOUDFRONT_DOMAIN/ai-generated-detection/image/easy/8d5b43b5-2d74-4a3a-bbe6-f8c78e1d32ba.png', '🎯', 'easy', 'ai-generated-detection', '인공지능은 아직 글자의 정교한 형태를 완벽하게 재현하지 못해 이미지 속 문자가 뭉개지거나 흐릿하게 나타나는 경우가 많습니다. 배경에 적힌 글씨가 읽기 어려울 정도로 일그러져 있거나 획이 어색하게 연결되어 있다면 AI가 생성한 이미지일 가능성이 매우 높습니다.', NULL, NULL, false, 'null', NULL, NULL, NULL, '2026-03-05 02:55:17.047896', '2026-03-05 02:55:17.047896');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'multiple_choice', 'video', 'https://YOUR_CLOUDFRONT_DOMAIN/videos/deepfake/deepfake_easy_001.mp4', '🎥', 'medium', 'video-synthesis-detection', '파티 장면에 고양이를 합성한 영상입니다. 고양이가 책상에 떨어질 때 효과가 부자연스럽고, 불빛 반사가 이상하며, 마지막 손 동작이 어색합니다.', '{"배경 파티가 자연스러워요","고양이 합성이 부자연스러워요","조명이 완벽해요","모든 게 자연스러워요"}', 1, NULL, NULL, NULL, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440005', 'true_false', 'video', 'https://YOUR_CLOUDFRONT_DOMAIN/videos/deepfake/deepfake_easy_001.mp4', '❌', 'medium', 'video-synthesis-detection', '이 영상은 합성 영상입니다. 파티 장면에 고양이를 합성했으며, 고양이가 책상에 떨어질 때 효과가 부자연스럽고, 불빛 반사와 손 동작이 어색합니다.', NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-03-05 01:59:21.339212', '2026-03-05 01:59:21.339212');
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index, correct_answer, correct_regions, tolerance, comparison_media_url, correct_side, created_at, updated_at) VALUES ('3c9e2951-0607-40eb-a4f1-04a05c25515e', 'multiple_choice', 'video', 'https://YOUR_CLOUDFRONT_DOMAIN/ai-generated-detection/video/easy/f5c3d00c-60b4-4a89-a909-c67940deb051.mp4', '🎯', 'easy', 'ai-generated-detection', '까마귀가 도구를 사용하는 모습이나 움직임은 매우 정교하고 자연스럽게 표현되었습니다. 하지만 바닥의 질감이 불규칙하게 흔들리는 물리적 오류가 발견되며, 영상 하단에 OpenAI의 비디오 생성 AI인 Sora 로고와 워터마크가 명시되어 있어 AI 생성물임을 확실히 알 수 있습니다.', '{"까마귀의 도구 사용 모습이 자연스러워요","하단에 소라 로고와 워터마크가 보여요","까마귀의 움직임이 매우 정교해 보여요"}', 1, NULL, 'null', NULL, NULL, NULL, '2026-03-05 03:17:18.292014', '2026-03-05 03:17:18.292014');

-- Insert sample community posts (어드민 공지만)
INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, likes, comments, tags, is_admin_post, created_at) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'admin', '운영진', '👮', '커뮤니티 이용 규칙 안내', '안녕하세요, 운영진입니다.

커뮤니티를 더 건강하게 만들기 위한 규칙을 안내드립니다:

1. 서로 존중하는 댓글 문화
2. 허위 정보 유포 금지
3. 상업적 광고 금지
4. 개인정보 보호

함께 만드는 건강한 커뮤니티! 협조 부탁드립니다.', 0, 0, ARRAY['공지', '규칙', '운영'], TRUE, NOW() - INTERVAL '3 days');
