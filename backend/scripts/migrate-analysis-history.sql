-- video_analysis 스키마 확장
-- 분석 이력, 횟수 제한, API 키 관리

-- ── 1. analysis_history ─────────────────────────────────────
-- tasks/results 테이블이 이미 있으므로 unified_results만 추가
CREATE TABLE IF NOT EXISTS video_analysis.unified_results (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id               UUID NOT NULL REFERENCES video_analysis.tasks(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL,
    final_verdict         VARCHAR(10) NOT NULL,          -- REAL / FAKE / UNCERTAIN
    confidence            NUMERIC(5,4) NOT NULL,
    ai_model              VARCHAR(50),                   -- Sora, Runway 등
    breakdown             JSONB NOT NULL DEFAULT '{}',
    total_processing_ms   INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_results_user_id
    ON video_analysis.unified_results(user_id, created_at DESC);

-- ── 2. analysis_quota (횟수 제한) ───────────────────────────
CREATE TABLE IF NOT EXISTS video_analysis.analysis_quota (
    user_id       UUID PRIMARY KEY,
    used_count    INTEGER NOT NULL DEFAULT 0,
    reset_at      TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 월별 무료 횟수 설정 (free: 5회, premium: 무제한 -1)
-- 실제 제한은 애플리케이션 레이어에서 처리

-- ── 3. api_keys ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_analysis.api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    name          VARCHAR(100) NOT NULL,
    key_hash      VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 해시 저장 (원문 노출 방지)
    key_prefix    VARCHAR(12) NOT NULL,         -- 'pf_' + 앞 8자 (목록 표시용)
    last_used_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at    TIMESTAMPTZ                   -- NULL이면 활성
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON video_analysis.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON video_analysis.api_keys(key_hash);
