-- Auth Service Schema
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
    author_id UUID NOT NULL,
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

CREATE TABLE community.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    author_id UUID NOT NULL,
    author_nickname VARCHAR(100) NOT NULL,
    author_emoji VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (post_id) REFERENCES community.posts(id) ON DELETE CASCADE
);

CREATE TABLE community.likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    user_id UUID NOT NULL,
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
