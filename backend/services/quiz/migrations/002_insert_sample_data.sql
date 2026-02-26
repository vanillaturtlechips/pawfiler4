-- Migration: 002_insert_sample_data.sql
-- Description: Insert sample quiz questions for testing

-- Insert sample multiple choice questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, options, correct_index)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440001',
        'MULTIPLE_CHOICE',
        'VIDEO',
        'https://example.com/videos/deepfake1.mp4',
        '🎬',
        'EASY',
        'deepfake-detection',
        '딥페이크 영상에서는 눈 깜빡임이 부자연스러운 경우가 많아요!',
        ARRAY['입 모양이 어색해요', '눈 깜빡임이 없어요', '머리카락이 흔들려요', '목소리가 달라요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440002',
        'MULTIPLE_CHOICE',
        'VIDEO',
        'https://example.com/videos/deepfake2.mp4',
        '🎥',
        'MEDIUM',
        'deepfake-detection',
        '얼굴 합성 경계 부분이 번지거나 흐릿한 건 딥페이크의 대표 특징이에요!',
        ARRAY['배경이 자연스러워요', '얼굴 경계가 번져요', '음성이 정확해요', '조명이 일치해요'],
        1
    ),
    (
        '550e8400-e29b-41d4-a716-446655440003',
        'MULTIPLE_CHOICE',
        'IMAGE',
        'https://example.com/images/deepfake3.jpg',
        '🖼️',
        'HARD',
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
        'TRUE_FALSE',
        'VIDEO',
        'https://example.com/videos/real1.mp4',
        '✅',
        'EASY',
        'deepfake-detection',
        '이 영상은 실제 영상입니다. 자연스러운 눈 깜빡임과 표정 변화가 관찰됩니다.',
        true
    ),
    (
        '550e8400-e29b-41d4-a716-446655440005',
        'TRUE_FALSE',
        'VIDEO',
        'https://example.com/videos/fake1.mp4',
        '❌',
        'MEDIUM',
        'deepfake-detection',
        '이 영상은 딥페이크입니다. 얼굴 경계가 부자연스럽게 번지는 것을 확인할 수 있습니다.',
        false
    );

-- Insert sample region select questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, correct_regions, tolerance)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440006',
        'REGION_SELECT',
        'IMAGE',
        'https://example.com/images/face1.jpg',
        '👁️',
        'MEDIUM',
        'deepfake-detection',
        '눈 주변 영역에서 딥페이크의 흔적을 발견할 수 있습니다.',
        '[{"x": 150, "y": 100, "radius": 30}, {"x": 250, "y": 100, "radius": 30}]'::jsonb,
        15
    ),
    (
        '550e8400-e29b-41d4-a716-446655440007',
        'REGION_SELECT',
        'IMAGE',
        'https://example.com/images/face2.jpg',
        '👄',
        'HARD',
        'deepfake-detection',
        '입 주변의 픽셀 왜곡이 딥페이크의 증거입니다.',
        '[{"x": 200, "y": 180, "radius": 40}]'::jsonb,
        20
    );

-- Insert sample comparison questions
INSERT INTO quiz.questions (id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation, comparison_media_url, correct_side)
VALUES 
    (
        '550e8400-e29b-41d4-a716-446655440008',
        'COMPARISON',
        'VIDEO',
        'https://example.com/videos/compare_left.mp4',
        '🔄',
        'MEDIUM',
        'deepfake-detection',
        '왼쪽 영상이 딥페이크입니다. 눈 깜빡임 패턴이 부자연스럽습니다.',
        'https://example.com/videos/compare_right.mp4',
        'left'
    ),
    (
        '550e8400-e29b-41d4-a716-446655440009',
        'COMPARISON',
        'IMAGE',
        'https://example.com/images/compare_left.jpg',
        '⚖️',
        'HARD',
        'deepfake-detection',
        '오른쪽 이미지가 딥페이크입니다. 얼굴 경계의 블러링이 관찰됩니다.',
        'https://example.com/images/compare_right.jpg',
        'right'
    );

-- Verify insertion
SELECT 
    type,
    difficulty,
    COUNT(*) as count
FROM quiz.questions
GROUP BY type, difficulty
ORDER BY type, difficulty;
