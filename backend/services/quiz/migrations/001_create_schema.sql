-- Migration: 001_create_schema.sql
-- Description: Create quiz schema and tables for quiz backend service
-- Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 16.2, 16.3, 16.4, 16.5

-- Create quiz schema
CREATE SCHEMA IF NOT EXISTS quiz;

-- Create questions table
-- Supports 4 question types: MULTIPLE_CHOICE, TRUE_FALSE, REGION_SELECT, COMPARISON
CREATE TABLE quiz.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'REGION_SELECT', 'COMPARISON')),
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('VIDEO', 'IMAGE')),
    media_url TEXT NOT NULL,
    thumbnail_emoji VARCHAR(10),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    category VARCHAR(50) NOT NULL,
    explanation TEXT NOT NULL,
    
    -- Multiple Choice fields (Requirements 2.3)
    options TEXT[],
    correct_index INTEGER,
    
    -- True/False fields (Requirements 2.4)
    correct_answer BOOLEAN,
    
    -- Region Select fields (Requirements 2.5)
    correct_regions JSONB,
    tolerance INTEGER,
    
    -- Comparison fields (Requirements 2.6)
    comparison_media_url TEXT,
    correct_side VARCHAR(10) CHECK (correct_side IN ('left', 'right')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_answers table (Requirements 2.7, 2.8)
CREATE TABLE quiz.user_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    question_id UUID NOT NULL REFERENCES quiz.questions(id) ON DELETE CASCADE,
    answer_data JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    xp_earned INTEGER NOT NULL DEFAULT 0,
    coins_earned INTEGER NOT NULL DEFAULT 0,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_stats table (Requirements 2.9, 2.10)
CREATE TABLE quiz.user_stats (
    user_id UUID PRIMARY KEY,
    total_answered INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    lives INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for query optimization (Requirements 16.4)
-- Questions table indexes
CREATE INDEX idx_questions_type ON quiz.questions(type);
CREATE INDEX idx_questions_difficulty ON quiz.questions(difficulty);
CREATE INDEX idx_questions_category ON quiz.questions(category);
CREATE INDEX idx_questions_type_difficulty ON quiz.questions(type, difficulty);

-- User answers table indexes
CREATE INDEX idx_user_answers_user_id ON quiz.user_answers(user_id);
CREATE INDEX idx_user_answers_question_id ON quiz.user_answers(question_id);
CREATE INDEX idx_user_answers_answered_at ON quiz.user_answers(answered_at);
CREATE INDEX idx_user_answers_user_question ON quiz.user_answers(user_id, question_id);

-- User stats table indexes
CREATE INDEX idx_user_stats_updated_at ON quiz.user_stats(updated_at);

-- Add comments for documentation
COMMENT ON SCHEMA quiz IS 'Quiz service schema for deepfake detection education';
COMMENT ON TABLE quiz.questions IS 'Stores quiz questions of 4 types: multiple choice, true/false, region select, comparison';
COMMENT ON TABLE quiz.user_answers IS 'Stores user answer history with rewards';
COMMENT ON TABLE quiz.user_stats IS 'Stores user quiz statistics including streak and lives';

COMMENT ON COLUMN quiz.questions.type IS 'Question type: MULTIPLE_CHOICE, TRUE_FALSE, REGION_SELECT, or COMPARISON';
COMMENT ON COLUMN quiz.questions.options IS 'Array of options for multiple choice questions';
COMMENT ON COLUMN quiz.questions.correct_index IS 'Index of correct option for multiple choice questions';
COMMENT ON COLUMN quiz.questions.correct_answer IS 'Correct boolean answer for true/false questions';
COMMENT ON COLUMN quiz.questions.correct_regions IS 'JSONB array of correct regions for region select questions';
COMMENT ON COLUMN quiz.questions.tolerance IS 'Tolerance in pixels for region select questions';
COMMENT ON COLUMN quiz.questions.comparison_media_url IS 'Second media URL for comparison questions';
COMMENT ON COLUMN quiz.questions.correct_side IS 'Correct side (left or right) for comparison questions';

COMMENT ON COLUMN quiz.user_answers.answer_data IS 'JSONB containing the user answer data for any question type';
COMMENT ON COLUMN quiz.user_answers.xp_earned IS 'Experience points earned for this answer';
COMMENT ON COLUMN quiz.user_answers.coins_earned IS 'Coins earned for this answer';

COMMENT ON COLUMN quiz.user_stats.current_streak IS 'Current consecutive correct answers';
COMMENT ON COLUMN quiz.user_stats.best_streak IS 'Best consecutive correct answers ever achieved';
COMMENT ON COLUMN quiz.user_stats.lives IS 'Number of lives remaining (decreases on wrong answers)';
