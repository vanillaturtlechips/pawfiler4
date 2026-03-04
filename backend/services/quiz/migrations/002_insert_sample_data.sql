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
        'deepfake-detection',
        '이 이미지에서 딥페이크의 흔적을 찾아보세요!',
        ARRAY['얼굴 경계가 자연스러워요', '얼굴 경계가 번져요', '조명이 완벽해요', '그림자가 정확해요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440002',
        'multiple_choice',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '🎥',
        'medium',
        'deepfake-detection',
        '영상에서 얼굴 합성 경계 부분이 번지거나 흐릿한 건 딥페이크의 대표 특징이에요!',
        ARRAY['배경이 자연스러워요', '얼굴 경계가 번져요', '음성이 정확해요', '조명이 일치해요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440003',
        'multiple_choice',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '🖼️',
        'hard',
        'deepfake-detection',
        '딥페이크는 조명 반사가 부자연스럽게 나타나는 경우가 많습니다.',
        ARRAY['조명 반사가 자연스러워요', '조명 반사가 이상해요', '그림자가 정확해요', '색감이 일치해요'],
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
        'deepfake-detection',
        '이 이미지는 딥페이크입니다. 얼굴 경계가 부자연스럽습니다.',
        false
    ),
    (
        '550e8400-e29b-41d4-a716-446655440005',
        'true_false',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '❌',
        'medium',
        'deepfake-detection',
        '이 영상은 딥페이크입니다. 얼굴 경계가 부자연스럽게 번지는 것을 확인할 수 있습니다.',
        false
    );

-- Insert sample region select questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_regions, tolerance)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440006',
        'region_select',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/deepfake_easy_001.jpg',
        '👁️',
        'medium',
        'deepfake-detection',
        '얼굴 중앙 영역에서 딥페이크의 흔적을 발견할 수 있습니다.',
        '[{"x": 300, "y": 300, "radius": 50}]'::jsonb,
        30
    ),
    (
        '550e8400-e29b-41d4-a716-446655440007',
        'region_select',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '👄',
        'hard',
        'deepfake-detection',
        '영상에서 얼굴 경계 부분의 픽셀 왜곡이 딥페이크의 증거입니다.',
        '[{"x": 300, "y": 400, "radius": 40}]'::jsonb,
        25
    );

-- Insert sample comparison questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, comparison_media_url, correct_side)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440008',
        'comparison',
        'image',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/deepfake/compare_left_001.jpg',
        '🔄',
        'medium',
        'deepfake-detection',
        '왼쪽 이미지가 딥페이크입니다. 얼굴 경계가 부자연스럽습니다.',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/images/real/compare_right_001.jpg',
        'left'
    ),
    (
        '550e8400-e29b-41d4-a716-446655440009',
        'comparison',
        'video',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
        '⚖️',
        'hard',
        'deepfake-detection',
        '오른쪽 영상이 딥페이크입니다. 얼굴 경계의 블러링이 관찰됩니다.',
        'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com/videos/deepfake/deepfake_easy_001.mp4',
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
