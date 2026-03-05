-- Auth Service Schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

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
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
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

-- Insert sample data
INSERT INTO quiz.questions (type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index) VALUES
('multiple_choice', 'video', 'https://example.com/video1.mp4', '🐶', 'easy', 'deepfake-detection', '이 영상은 AI로 생성된 딥페이크입니다. 눈 깜빡임 패턴이 부자연스럽습니다.', ARRAY['진짜 영상', '딥페이크', '편집된 영상', '잘 모르겠음'], 1),
('multiple_choice', 'video', 'https://example.com/video2.mp4', '🐱', 'medium', 'deepfake-detection', '이 영상은 실제 촬영된 영상입니다.', ARRAY['진짜 영상', '딥페이크', '편집된 영상', '잘 모르겠음'], 0),
('multiple_choice', 'video', 'https://example.com/video3.mp4', '🐰', 'hard', 'deepfake-detection', '얼굴 경계선에서 미세한 왜곡이 발견됩니다.', ARRAY['진짜 영상', '딥페이크', '편집된 영상', '잘 모르겠음'], 1);

INSERT INTO quiz.questions (type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_answer) VALUES
('true_false', 'video', 'https://example.com/video4.mp4', '🦊', 'easy', 'deepfake-detection', '이 영상은 딥페이크입니다. 조명 방향이 일치하지 않습니다.', true),
('true_false', 'image', 'https://example.com/image1.jpg', '🐻', 'medium', 'deepfake-detection', '이 이미지는 실제 사진입니다.', false);

INSERT INTO quiz.questions (type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_regions, tolerance) VALUES
('region_select', 'image', 'https://example.com/image2.jpg', '🔍', 'hard', 'deepfake-detection', '귀 주변 경계선이 부자연스럽습니다.', '[{"x": 150, "y": 200, "radius": 30}]'::jsonb, 20);

INSERT INTO quiz.questions (type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, comparison_media_url, correct_side) VALUES
('comparison', 'image', 'https://example.com/compare1_left.jpg', '⚖️', 'medium', 'deepfake-detection', '왼쪽 이미지가 딥페이크입니다. 눈동자 반사가 부자연스럽습니다.', 'https://example.com/compare1_right.jpg', 'left');

-- Insert sample community posts (공지 1개 + 일반 2개)
INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, likes, comments, tags, created_at) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'admin', '운영진', '👮', '커뮤니티 이용 규칙 안내', '안녕하세요, 운영진입니다.

커뮤니티를 더 건강하게 만들기 위한 규칙을 안내드립니다:

1. 서로 존중하는 댓글 문화
2. 허위 정보 유포 금지
3. 상업적 광고 금지
4. 개인정보 보호

함께 만드는 건강한 커뮤니티! 협조 부탁드립니다.', 0, 0, '["공지", "규칙", "운영"]'::jsonb, NOW() - INTERVAL '3 days'),

('550e8400-e29b-41d4-a716-446655440001', 'user_raccoon', '탐정 너구리', '🦝', '딥페이크 탐지 초보자 가이드', '안녕하세요! 딥페이크 탐지를 시작하는 분들을 위한 가이드입니다.

1. 눈 깜빡임 패턴 확인
2. 얼굴 경계선 체크
3. 조명 일관성 확인
4. 입술 싱크 분석

이 4가지만 잘 체크하면 대부분의 딥페이크를 찾아낼 수 있습니다!', 0, 0, '["초보자", "가이드", "딥페이크"]'::jsonb, NOW() - INTERVAL '2 hours'),

('550e8400-e29b-41d4-a716-446655440002', 'user_fox', '명탐정 여우', '🦊', '최신 AI 딥페이크 기술 분석', '최근 GPT-4 기반 딥페이크 생성 기술이 발전하면서 탐지가 더욱 어려워지고 있습니다.

특히 주의해야 할 점:
- 미세한 피부 텍스처 변화
- 머리카락 경계선의 부자연스러움
- 배경과의 조명 불일치

여러분도 조심하세요!', 0, 0, '["AI", "딥페이크", "분석"]'::jsonb, NOW() - INTERVAL '1 hour');

-- Insert sample comments
INSERT INTO community.comments (id, post_id, author_id, author_nickname, author_emoji, content, created_at) VALUES
('c50e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'user_fox', '명탐정 여우', '🦊', '정말 유용한 가이드네요! 초보자들에게 큰 도움이 될 것 같습니다.', NOW() - INTERVAL '1 day'),
('c50e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'user_raccoon', '탐정 너구리', '🦝', '좋은 정보 감사합니다!', NOW() - INTERVAL '12 hours');

-- Insert sample likes
INSERT INTO community.likes (id, post_id, user_id, created_at) VALUES
('150e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'user_fox', NOW() - INTERVAL '1 day'),
('150e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'user_raccoon', NOW() - INTERVAL '12 hours');

-- Update likes and comments count to match actual data
UPDATE community.posts p
SET likes = (SELECT COUNT(*) FROM community.likes l WHERE l.post_id = p.id),
    comments = (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id);
