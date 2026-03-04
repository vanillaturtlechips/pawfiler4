-- Migration: 002_insert_sample_data.sql
-- Description: Insert sample quiz questions for testing

-- Insert sample multiple choice questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440001',
        'multiple_choice',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '🎬',
        'easy',
        'ai-generated-detection',
        '오른쪽 위 보드의 글씨가 깨지고 왜곡된 것이 AI 생성 이미지의 특징입니다!',
        ARRAY['얼굴 표정이 부자연스러워요', '배경 글씨가 깨져있어요', '조명이 완벽해요', '그림자가 정확해요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440002',
        'multiple_choice',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '🎥',
        'easy',
        'video-synthesis-detection',
        '파티 장면에 고양이를 합성한 영상입니다. 고양이가 책상에 떨어질 때 효과가 부자연스럽고, 불빛 반사가 이상하며, 마지막 손 동작이 어색합니다.',
        ARRAY['배경 파티가 자연스러워요', '고양이 합성이 부자연스러워요', '조명이 완벽해요', '모든 게 자연스러워요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440003',
        'multiple_choice',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '🖼️',
        'easy',
        'ai-generated-detection',
        'AI가 생성한 이미지는 텍스트나 작은 디테일을 제대로 표현하지 못하는 경우가 많습니다.',
        ARRAY['인물의 포즈가 자연스러워요', '배경의 텍스트가 왜곡되어있어요', '그림자가 정확해요', '색감이 일치해요'],
        1
    );

-- Insert sample true/false questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_answer)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440004',
        'true_false',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '✅',
        'easy',
        'ai-generated-detection',
        '이 이미지는 AI가 생성한 가짜입니다. 오른쪽 위 보드의 글씨가 깨지고 왜곡되어 있습니다.',
        false
    ),
    (
        '550e8400-e29b-41d4-a716-446655440005',
        'true_false',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '❌',
        'easy',
        'video-synthesis-detection',
        '이 영상은 합성 영상입니다. 파티 장면에 고양이를 합성했으며, 고양이가 책상에 떨어질 때 효과가 부자연스럽고, 불빛 반사와 손 동작이 어색합니다.',
        false
    );

-- Insert sample region select questions (이미지만)
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_regions, tolerance)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440006',
        'region_select',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '👁️',
        'easy',
        'ai-generated-detection',
        '오른쪽 위 보드의 글씨가 깨지고 왜곡된 부분이 AI 생성 이미지의 증거입니다.',
        '[{"x": 650, "y": 150, "radius": 80}]'::jsonb,
        50
    ),
    (
        '550e8400-e29b-41d4-a716-446655440007',
        'region_select',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '👄',
        'easy',
        'ai-generated-detection',
        '배경의 텍스트 왜곡은 AI가 생성한 이미지에서 자주 발견되는 특징입니다.',
        '[{"x": 650, "y": 150, "radius": 80}]'::jsonb,
        50
    );

-- Insert sample comparison questions (이미지만)
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, comparison_media_url, correct_side)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440008',
        'comparison',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/compare_left_001.jpg',
        '🔄',
        'easy',
        'ai-generated-detection',
        '왼쪽 이미지가 딥페이크입니다. 얼굴 경계가 부자연스럽습니다.',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/real/compare_right_001.jpg',
        'right'
    );

-- Verify insertion
SELECT 
    type,
    media_type,
    difficulty,
    COUNT(*) as count
FROM quiz.questions
GROUP BY type, media_type, difficulty
ORDER BY type, media_type, difficulty;
