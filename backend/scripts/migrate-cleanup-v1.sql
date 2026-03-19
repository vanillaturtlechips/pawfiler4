-- ============================================================
-- PawFiler Cleanup Migration v1
-- 목적: 구조적 불일치 및 유령 데이터 정리
-- 적용 순서: migrate-perf-v2.sql 이후 실행
-- ============================================================

-- ============================================================
-- 1. auth.users 유령 컬럼 제거
--
-- 제거 근거:
--   - coins/xp/level/level_title: quiz.user_profiles가 source of truth
--     auth.users의 이 컬럼들은 가입 시 0/초기값으로 설정된 후 영구 미갱신
--     코드 전체 검색 결과 어떤 Go 서비스도 이 컬럼을 SELECT/UPDATE하지 않음
--   - subscription_type: payment.subscriptions 테이블이 관리
--     auth.users.subscription_type도 마찬가지로 미갱신 (항상 'free')
--   - updated_at: 어디서도 UPDATE 쿼리에 포함되지 않음
--
-- 수정 시 새로 발생하는 문제:
--   - 없음. SELECT *가 존재하지 않고 명시적 컬럼 SELECT만 사용됨
--   - 향후 코드가 이 컬럼을 참조 시도하면 명확한 에러로 즉시 감지 가능
--      (오히려 silent 오동작보다 안전)
-- ============================================================

BEGIN;

-- 컬럼 존재 여부 확인 후 제거 (이미 없으면 무시)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'coins'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN coins;
        RAISE NOTICE 'Dropped auth.users.coins';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'xp'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN xp;
        RAISE NOTICE 'Dropped auth.users.xp';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'level'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN level;
        RAISE NOTICE 'Dropped auth.users.level';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'level_title'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN level_title;
        RAISE NOTICE 'Dropped auth.users.level_title';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'subscription_type'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN subscription_type;
        RAISE NOTICE 'Dropped auth.users.subscription_type';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE auth.users DROP COLUMN updated_at;
        RAISE NOTICE 'Dropped auth.users.updated_at';
    END IF;
END $$;

-- ============================================================
-- 2. quiz.user_profiles total_coins DEFAULT 통일
--
-- 문제: init-db.sql은 DEFAULT 3000, Go 코드 CreateUserProfile은 500
-- Go 코드가 항상 명시 값(500)을 전달하므로 DB 기본값은 사실상 미사용
-- 그러나 직접 INSERT 시 오동작 방지를 위해 500으로 통일
--
-- 수정 시 새로 발생하는 문제:
--   - 없음. 기존 유저 데이터는 영향 없음 (DEFAULT는 새 INSERT에만 적용)
-- ============================================================

ALTER TABLE quiz.user_profiles ALTER COLUMN total_coins SET DEFAULT 500;

-- ============================================================
-- 3. quiz.user_answers → quiz.user_profiles FK 추가
--
-- 문제: user_answers.user_id에 FK가 없어 고아 행 누적 가능
-- 해결: quiz.user_profiles(user_id)를 참조하는 FK 추가
--       ON DELETE NO ACTION (CASCADE 없음) — profiles 삭제 흐름이 없으므로 충분
--
-- 수정 시 새로 발생하는 문제:
--   - 만약 quiz.user_profiles가 없는 user_id로 답변 저장 시도하면 FK 위반 에러
--     → 이는 버그를 명확히 드러내는 것으로 의도된 동작
--   - quiz.user_profiles 생성 전에 user_answers INSERT를 시도하는 코드 경로가
--     있다면 오류 발생. GetRandomQuestion → CreateUserProfile → SubmitAnswer
--     순서가 보장되므로 실제 문제 없음
--
-- 주의: 기존 고아 행이 있으면 FK 생성 실패 → 아래 정리 먼저 실행
-- ============================================================

-- 고아 행 확인 및 정리 (FK 생성 전)
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM quiz.user_answers ua
    WHERE NOT EXISTS (
        SELECT 1 FROM quiz.user_profiles up WHERE up.user_id = ua.user_id
    );

    IF orphan_count > 0 THEN
        RAISE NOTICE '고아 user_answers % 건 발견 — 삭제 후 FK 생성', orphan_count;
        DELETE FROM quiz.user_answers ua
        WHERE NOT EXISTS (
            SELECT 1 FROM quiz.user_profiles up WHERE up.user_id = ua.user_id
        );
    ELSE
        RAISE NOTICE '고아 user_answers 없음 — FK 바로 생성';
    END IF;
END $$;

-- FK 추가 (이미 있으면 무시)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
          AND table_schema = 'quiz'
          AND table_name = 'user_answers'
          AND constraint_name = 'fk_user_answers_user_id'
    ) THEN
        ALTER TABLE quiz.user_answers
            ADD CONSTRAINT fk_user_answers_user_id
            FOREIGN KEY (user_id) REFERENCES quiz.user_profiles(user_id)
            ON DELETE NO ACTION
            DEFERRABLE INITIALLY DEFERRED;
        RAISE NOTICE 'FK fk_user_answers_user_id 생성 완료';
    ELSE
        RAISE NOTICE 'FK fk_user_answers_user_id 이미 존재';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- 4. likes/comments 카운터 드리프트 검증 및 복구
--
-- 이 섹션은 트랜잭션 밖에서 실행 (대용량 UPDATE)
-- 운영 중 실행 시 주의 — 트래픽 낮은 시간대 권장
-- 실행 전 반드시 조회 쿼리로 영향 범위 확인
-- ============================================================

-- [STEP 1] 드리프트 현황 조회 (읽기 전용, 영향 없음)
SELECT
    p.id,
    p.title,
    p.likes          AS stored_likes,
    COUNT(l.id)      AS actual_likes,
    p.likes - COUNT(l.id) AS drift_likes,
    p.comments       AS stored_comments,
    (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id) AS actual_comments,
    p.comments - (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id) AS drift_comments
FROM community.posts p
LEFT JOIN community.likes l ON l.post_id = p.id
GROUP BY p.id, p.title, p.likes, p.comments
HAVING p.likes != COUNT(l.id)
    OR p.comments != (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id)
ORDER BY ABS(p.likes - COUNT(l.id)) + ABS(p.comments - (SELECT COUNT(*) FROM community.comments cx WHERE cx.post_id = p.id)) DESC;

-- [STEP 2] 카운터 복구 (드리프트 발견 시 실행)
-- 주의: 큰 테이블에서는 batch 처리 권장
-- UPDATE community.posts p
-- SET
--     likes    = (SELECT COUNT(*) FROM community.likes    l WHERE l.post_id = p.id),
--     comments = (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id)
-- WHERE
--     likes    != (SELECT COUNT(*) FROM community.likes    l WHERE l.post_id = p.id)
--  OR comments != (SELECT COUNT(*) FROM community.comments c WHERE c.post_id = p.id);

-- ============================================================
-- 검증 쿼리 — 마이그레이션 완료 후 실행
-- ============================================================

-- auth.users 컬럼 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users'
ORDER BY ordinal_position;

-- quiz.user_profiles DEFAULT 확인
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'quiz' AND table_name = 'user_profiles' AND column_name = 'total_coins';

-- FK 확인
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS references_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'quiz' AND tc.table_name = 'user_answers' AND tc.constraint_type = 'FOREIGN KEY';
