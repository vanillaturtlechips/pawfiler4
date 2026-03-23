# ML 세션 작업 요약 — 2026-03-21

> 작업 범위: ai-orchestration 개선, video-analysis 경량화, 프론트 UX, 비즈니스 로직, 파이프라인 설계/구현

---

## 1. 브랜치 정리 및 main pull

### pawfiler4
- 기존 로컬 변경사항을 3개 브랜치로 분리 커밋
  - `myong/ai-orchestration-v2`: app.py, agents.py, models.py, requirements.txt
  - `myong/video-analysis-update`: server.py, Dockerfile, requirements.txt
  - `myong/infra-update`: build-and-push.sh, train3.py, webdataset-packaging.tf
- main pull → 39 files 변경 (chat-bot 대규모 업데이트, chatbot-knowledge 재편, aiops.tf 신규)

### pawfiler4-argocd
- `myong/rayservice-serviceaccount`: rayservice.yaml Head Node ServiceAccount 추가
- main pull → admin external secret 추가, cluster-secret-store 경로 이동 (infrastructure/ → 루트)

---

## 2. 서비스 경계 설계 원칙 확정

```
video-analysis 서비스                  ai-orchestration 서비스
─────────────────────────              ──────────────────────────
✅ 영상 파일 수신 (gRPC 스트리밍)       ✅ AI 추론 (VideoAgent, AudioAgent)
✅ S3 업로드 + task 관리               ✅ Cascade Gate (XGBoost)
✅ 미디어 메타데이터 추출               ✅ FusionAgent (최종 판단)
✅ 분석 결과 조회 API                  ✅ 모델 서빙 (Ray Serve)
✅ ai-orchestration 호출               ✅ /internal/callback으로 결과 전달

❌ AI 추론 금지                         ❌ 파일 수신/저장 금지
❌ 모델 로드 금지                       ❌ task 상태 관리 금지
```

**흐름**
```
프론트 → video-analysis (S3 저장 + task_id) → ai-orchestration (추론)
                                             ← /internal/callback (결과)
프론트 ← GetUnifiedResult (폴링)
```

---

## 3. video-analysis 경량화 (`myong/video-analysis-refactor`)

### 삭제된 파일
`local_detector.py`, `cascade_detector.py`, `audio_deepfake_detector.py`, `audio_analyzer.py`,
`lambda_invoker.py`, `result_aggregator.py`, `vector_extractor.py`, `cost_tracker.py`,
`deepfake_detector.py`, `server_old.py`, `server_minimal.py`, `train.py`, `lambdas/`, `ml/`

### 남은 파일
```
server.py          — gRPC: S3 업로드 + task 관리 + ai-orchestration HTTP 호출
rest_server.py     — Flask: multipart 업로드 + /internal/callback 수신
media_inspector.py — ffprobe 메타데이터 추출
preprocess_s3.py   — S3 유틸
```

### requirements.txt 변화
- 제거: torch, onnxruntime 등 AI 의존성
- 추가: httpx (ai-orchestration 호출), psycopg2-binary, redis
- CPU 전용 경량 파드로 운영 가능

---

## 4. 프론트 영상 분석 UX 개선 (`myong/frontend-analysis-ux`)

### AnalysisPage.tsx
- URL 입력 제거 → 파일 업로드만
- 업로드 전 `<video>` 태그 미리보기
- 파일 크기(100MB) + 포맷 유효성 검사
- 로그 터미널 → 단계별 progress bar (업로드 → 연결 → AI 분석 → 완료)
- 결과 화면: 공유(Web Share API), 저장(JSON 다운로드), 퀴즈 연동 버튼

### ApiKeyManager.tsx (신규)
- 외부 API 키 발급/관리 컴포넌트
- AnalysisPage 하단에 접기/펼치기 섹션으로 배치
- curl 사용 예시 코드 블록 포함

### docs/ML_AI_BUSINESS_EXPANSION.md (신규)
- AI 비즈니스 확장 방향 문서
- 내부 서비스 확장 (퀴즈 자동 생성, 커뮤니티 태깅, 리포트 강화)
- 외부 공개 API (B2B) 장기 방향 및 전제 조건

---

## 5. 분석 이력 + 횟수 제한 + API 키 (`myong/analysis-history-quota`)

### DB 마이그레이션 (`migrate-analysis-history.sql`)
```sql
video_analysis.unified_results  -- 분석 결과 이력
video_analysis.analysis_quota   -- 월별 횟수 (Redis로 실제 카운팅)
video_analysis.api_keys         -- SHA-256 해시 저장 (원문 노출 없음)
quiz.questions.status           -- 'active' | 'pending' (AI 자동 생성 검수용)
```

### rest_server.py 엔드포인트
| 경로 | 설명 |
|---|---|
| `POST /api/upload-video` | 파일 업로드 + 횟수 체크 |
| `POST /internal/callback` | ai-orchestration 결과 수신 + 이력 저장 |
| `POST /api/analysis/history` | 분석 이력 조회 |
| `POST /api/analysis/quota` | 남은 횟수 조회 |
| `POST /api/keys` | API 키 목록 |
| `POST /api/keys/generate` | API 키 발급 (원문 1회 반환) |
| `POST /api/keys/revoke` | API 키 삭제 |

### 횟수 제한 로직
```
업로드 요청
  ├─ premium 유저? → 무제한 허용 (auth.users subscription_type 확인)
  ├─ 무료 횟수(5회) 남음? → Redis incr, 허용
  └─ 초과? → user 서비스 AddRewards(coin_delta: -10)
              ├─ 코인 충분 → 차감 후 허용
              └─ 코인 부족 → 429
```

### 프론트 연동
- `api.ts`: fetchAnalysisHistory, fetchAnalysisQuota, fetchApiKeys, generateApiKey, revokeApiKey
- `AnalysisPage`: 이번 달 횟수 표시 (프리미엄: 👑 무제한, 소진: 코인 안내)
- `ProfilePage`: 분석 이력 탭 추가 (verdict + AI 모델명 + 날짜)
- `ApiKeyManager`: mock 제거, 백엔드 연결

---

## 6. 퀴즈 자동 생성 + 커뮤니티 자동 태깅 (`myong/ai-pipeline-quiz-tagging`)

### 퀴즈 자동 생성 파이프라인
- 트리거: 분석 완료 콜백 + confidence ≥ 0.85 + verdict FAKE/REAL
- admin 서비스 `POST /admin/quiz/questions` 호출
- `status: pending` 으로 생성 → 어드민 검수 후 `active` 변경 시 노출
- 난이도 자동: 0.85~0.92 → medium, 0.92+ → hard

### 커뮤니티 자동 태깅 파이프라인
- 트리거: 분석 완료 콜백 + task에 `community_post_id` 있을 때
- `community.posts.tags` 배열에 자동 추가
  - FAKE → `AI생성`, AI 모델명 (e.g. `Sora`)
  - REAL → `실제영상`
  - 음성 합성 감지 → `합성음성`
- `community/main.go`에 `/internal/add-tags` 엔드포인트 추가 (내부 전용)

---

## 7. PR 목록

| 브랜치 | 레포 | 내용 |
|---|---|---|
| `myong/ai-orchestration-v2` | pawfiler4 | AudioAgent HuggingFace, FusionAgent Nova Lite |
| `myong/video-analysis-refactor` | pawfiler4 | AI 추론 제거, 경량화 |
| `myong/video-analysis-update` | pawfiler4 | server 리팩토링 |
| `myong/infra-update` | pawfiler4 | build-and-push, train3, terraform |
| `myong/frontend-analysis-ux` | pawfiler4 | UX 개선 + API 키 관리 |
| `myong/analysis-history-quota` | pawfiler4 | 이력 + 횟수 제한 + 코인 차감 |
| `myong/ai-pipeline-quiz-tagging` | pawfiler4 | 퀴즈 자동 생성 + 커뮤니티 태깅 |
| `myong/rayservice-serviceaccount` | pawfiler4-argocd | rayservice ServiceAccount |

---

## 8. 남은 작업

### 모델 학습 완료 후
- `app.py _preprocess()` — ffmpeg/decord 실제 전처리 (현재 랜덤 numpy)
- `models.py` SyncNet — 실제 추론 (현재 0.5 고정)
- AudioAgent — 음성 모델 식별 (현재 ElevenLabs 하드코딩)
- FusionAgent — 벡터 DB 유사 케이스 검색 (현재 빈 배열)

### 환경변수 설정 필요 (배포 시)
```
AI_ORCHESTRATION_URL=http://ai-orchestration:8000
USER_SERVICE_URL=http://user-service:8083
ADMIN_SERVICE_URL=http://admin-service:8082
COMMUNITY_SERVICE_URL=http://community-service:8082
DATABASE_URL=...
REDIS_URL=...
S3_BUCKET=pawfiler-videos
```
