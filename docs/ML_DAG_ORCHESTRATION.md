# ML_DAG_ORCHESTRATION.md — Ray Serve DAG 설계 분석

> ai-orc 코드베이스 기반 DAG 구조 정리
> 작성일: 2026-03-19

---

## 1. 전체 DAG 구조

```
Request
   │
   ▼
[Orchestrator]  ← HTTP Ingress (num_replicas=2)
   │
   ├─ 1. XGBoostGate.predict()
   │       ├─ confident ≥ 0.85 → 즉시 반환 (Cascade Hit, ~80% 케이스)
   │       └─ 불확실 → Deep Path ↓
   │
   ├─ 2. ray.put(frames), ray.put(audio)  ← Plasma Store에 1회 저장
   │
   ├─ 3. Fan-out (asyncio.gather — 병렬 동시 실행)
   │       ├─ VideoAgent.predict(frames_ref)
   │       ├─ AudioAgent.predict(audio_ref)
   │       └─ SyncAgent.predict(frames_ref, audio_ref)
   │
   └─ 4. Fan-in
           └─ FusionAgent.ensemble(results) → 최종 응답
```

---

## 2. 레이어 구성

| Layer | 컴포넌트 | num_replicas | GPU | 역할 |
|---|---|---|---|---|
| 1 | SharedModelWorker | 1 (싱글톤) | 1 | 모델 VRAM 로드 + 추론 위임 수신 |
| 2 | VideoAgent | 2 | 0 | 전처리/후처리 (CPU) + 추론 위임 |
| 2 | AudioAgent | 2 | 0 | MFCC/Mel 추출 (CPU) + 추론 위임 |
| 2 | SyncAgent | 1 | 0 | 립싱크 분석 (CPU) + 추론 위임 |
| 2 | FusionAgent | 1 | 0 | Late Fusion + 설명 생성 |
| 3 | Orchestrator | 2 | 0 | HTTP Ingress + DAG 제어 |
| - | XGBoostGate | 2 | 0 | Cascade 1단계 필터 (CPU) |

---

## 3. 핵심 설계 포인트

### 3-1. Zero-Copy Plasma Store

프레임/오디오를 `ray.put()`으로 Plasma에 한 번만 올리고, 각 에이전트엔 `ObjectRef`(주소)만 전달. 텐서 복사 비용 0.

```python
frames_ref = ray.put(preprocessed["frames"])  # Plasma에 1회 저장
audio_ref  = ray.put(preprocessed["audio"])

# 에이전트들은 주소(ref)만 받음 — 데이터 복사 없음
tasks["video"] = self.video.predict.remote(frames_ref)
tasks["audio"] = self.audio.predict.remote(audio_ref)
tasks["sync"]  = self.sync.predict.remote(frames_ref, audio_ref)
```

### 3-2. GPU 싱글톤 패턴

`SharedModelWorker`는 `num_replicas=1` 고정. 에이전트들은 `num_gpus=0`으로 CPU만 쓰고 GPU 연산만 워커에 위임 → VRAM 중복 로드 없음.

```python
# SharedModelWorker: GPU 1장 점유, 1개만 존재
@serve.deployment(num_replicas=1, ray_actor_options={"num_gpus": 1})
class SharedModelWorker: ...

# 에이전트: GPU 0, 수평 확장 자유
@serve.deployment(num_replicas=2, ray_actor_options={"num_gpus": 0})
class VideoAgent:
    def __init__(self, model_worker):
        self.model = model_worker  # handle만 보유
    
    async def predict(self, frames_ref):
        frames_np = ray.get(frames_ref)           # Plasma에서 꺼내기
        result = await self.model.video_inference.remote(frames_np)  # GPU 위임
```

### 3-3. Graceful Degradation

`asyncio.gather(return_exceptions=True)`로 특정 에이전트 실패해도 나머지 결과로 Fusion 진행.

```python
gathered = await asyncio.gather(
    *[tasks[k] for k in tasks],
    return_exceptions=True,
)
for key, result in zip(tasks.keys(), gathered):
    if isinstance(result, Exception):
        results[key] = self._fallback_result(key)  # 안전한 기본값
    else:
        results[key] = result
```

---

## 4. Cascade Gate 판단 흐름

```python
CONFIDENCE_THRESHOLD = 0.85  # 이 이상이면 XGBoost만으로 종결

# ~80% 케이스: GPU 안 씀
if cascade_result["confident"]:
    return JSONResponse(self._format_response(cascade_result, elapsed, deep=False))

# ~20% 케이스: Deep Path (Fan-out → Fan-in)
```

**Features (XGBoost 입력):**
- `laplacian_var`: 고주파 성분 (GAN은 약함)
- `dct_ratio`: DCT 저주파 비율
- `channel_stats`: RGB 채널별 mean/std (6개)
- `temporal_diff_mean/std`: 프레임 간 변화량

---

## 5. Fusion 전략 (Late Fusion)

```python
WEIGHTS = {"video": 0.7, "audio": 0.3}

# 가중 평균
final_confidence = weighted_confidence / total_weight

# 최종 판단: 하나라도 fake면 fake
is_fake = any([
    breakdown["video"]["is_fake"],
    breakdown["audio"]["is_synthetic"],
    breakdown["sync"]["is_synced"] is False and sync_confidence > 0.7,
])
```

> Cross-attention 기반 Fusion은 Phase 4에서 추가 예정.

---

## 6. 응답 포맷

```json
{
  "verdict": "fake",
  "confidence": 0.94,
  "breakdown": {
    "video": {"is_fake": true, "ai_model": "Sora", "confidence": 0.87},
    "audio": {"is_synthetic": true, "voice_model": "ElevenLabs", "confidence": 0.92},
    "sync":  {"is_synced": false, "confidence": 0.73}
  },
  "explanation": "영상: Sora로 생성됨 (87%) | 음성: ElevenLabs 합성 (92%) | 립싱크 불일치 (73%)",
  "meta": {
    "latency_ms": 143.5,
    "path": "deep"  // "cascade" or "deep"
  }
}
```
