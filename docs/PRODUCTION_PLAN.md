# PawFiler — Mock → Ray Serve 프로덕션 전환 계획

최종 업데이트: 2026-03-27

---

## 현황 요약

| 레이어 | 상태 |
|--------|------|
| Ray Serve 파이프라인 (Orchestrator → Fan-out → Fusion) | ✅ 구현 완료 |
| SharedModelWorker GPU 싱글톤 | ✅ 구현 완료 |
| XGBoost Cascade Gate | ✅ 구현 완료 (학습 데이터 필요) |
| 프론트엔드 에이전트 탭 UI | ✅ UI 완료, 백엔드 연결 필요 |
| LLM Agent 스트리밍 | ❌ 미구현 |
| Metadata Agent | ❌ 미구현 |
| 에이전트 선택적 재실행 | ❌ 미구현 |
| 배치 큐 | ❌ 미구현 |
| 적대적 공격 시뮬레이션 | ❌ 미구현 |

---

## Phase 1 — 핵심 파이프라인 연결 (우선순위 높음)

### 1-1. 응답 스키마 통일
- `app.py` `_format_response()`에 에이전트별 상세 필드 추가
  ```
  {
    "verdict": "fake|real|uncertain",
    "confidence": 0.87,
    "elapsed_ms": 1200,
    "agents": {
      "video": { "is_fake": true, "ai_model": "Sora", "confidence": 0.91, "frame_scores": [...] },
      "audio": { "is_fake": false, "confidence": 0.62, "segment_scores": [...] },
      "sync":  { "sync_score": 0.44 },
      "fusion":{ "weights": {...}, "reasoning": "..." }
    },
    "metadata": { "codec": "h264", "fps": 30, "resolution": "1920x1080", "exif": {...} }
  }
  ```

### 1-2. VideoAgent 응답 확장
- `agents.py` `VideoAgent.predict()` 반환값에 `frame_scores` 배열 추가
- 프레임별 딥페이크 점수 (라인 차트용)
- GAN 아티팩트 탐지 결과 포함

### 1-3. AudioAgent 응답 확장
- `AudioAgent.predict()` 반환값에 `segment_scores` 배열 추가
- 세그먼트별 합성 점수 (바 차트용)
- TTS 판별 결과 포함

### 1-4. Metadata Agent 추가
- `app.py` `_preprocess()` 단계에서 EXIF/코덱 정보 추출
- `ffprobe` 또는 `pymediainfo`로 fps, 비트레이트, 해상도, 인코딩 이력 파싱
- 별도 `@serve.deployment` 불필요 — Orchestrator 내부에서 처리

### 1-5. 프론트엔드 api.ts 연결
- `analyzeVideo()` 응답 파싱을 새 스키마에 맞게 수정
- 에이전트별 탭 데이터 바인딩 (Visual / Audio / Metadata)
- 레이더 차트 `breakdown.weights` 필드 연결

---

## Phase 2 — LLM Agent 스트리밍

### 2-1. FusionAgent에 Ollama 스트리밍 연결
- `agents.py` `FusionAgent.ensemble()` 내부에서 Ollama `/api/generate` 스트리밍 호출
- 추론 근거(Chain of Thought) 텍스트 생성
- 모델: `llama3` 고정 (`ollama pull llama3` 필요)

### 2-2. 스트리밍 엔드포인트 추가
- `app.py`에 `/analyze/stream` SSE 엔드포인트 추가
- Starlette `StreamingResponse`로 토큰 단위 전송

### 2-3. 프론트엔드 스트리밍 수신
- `api.ts`에 `EventSource` 또는 `fetch` + `ReadableStream` 처리 추가
- LLM Agent 탭에서 타이핑 애니메이션 렌더링

---

## Phase 3 — 에이전트 선택적 재실행

### 3-1. Orchestrator `agent_mask` 파라미터
- 요청 body에 `"agents": ["video", "audio"]` 옵션 추가
- 지정된 에이전트만 Fan-out, 나머지는 이전 결과 재사용

### 3-2. 프론트엔드 재실행 UI 연결
- 에이전트 탭별 재실행 버튼 → `agent_mask` 포함 재요청
- 재실행 후 앙상블 신뢰도 자동 재계산

---

## Phase 4 — 배치 큐

### 4-1. 백엔드 큐 엔드포인트
- `app.py`에 `/batch/submit`, `/batch/status/{job_id}` 추가
- `asyncio.Queue` 또는 Ray Queue로 순차/병렬 처리

### 4-2. 프론트엔드 배치 대시보드 연결
- 폴링 또는 SSE로 개별 진행 상태 수신

---

## Phase 5 — 적대적 공격 시뮬레이션

### 5-1. `/simulate` 엔드포인트 추가
- 6가지 공격 벡터를 numpy/opencv로 적용 후 재분석
  - Gaussian Noise, JPEG Compression, Frame Interpolation
  - Face Swap Overlay, Adversarial Patch, Temporal Shuffle
- 공격 전/후 confidence 비교 → Robustness Score 계산

### 5-2. 프론트엔드 시뮬레이션 UI 연결
- RadialBarChart 게이지 데이터 바인딩

---

## 로컬 실행 방법 (GPU 없이)

```bash
# 의존성 설치
cd backend/services/ai-orchestration
pip install -r requirements.txt

# CPU 모드로 실행 (CUDA 없어도 동작, 속도 느림)
serve run app:build_app --host 0.0.0.0 --port 8000
```

---

## 작업 순서 권장

```
Phase 1 (1-1 ~ 1-5) → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Phase 1만 완료해도 현재 mock UI의 핵심 기능(에이전트 탭, 레이더 차트)은 실제 데이터로 동작함.
