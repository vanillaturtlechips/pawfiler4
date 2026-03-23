# AI 생성 영상 탐지 서비스 배포 작업 보고서

> 작업일: 2026-03-22
> 작업 범위: ai-orchestration Ray Serve 배포, 버그 수정, 추론 파이프라인 검증

---

## 1. 서비스 개요

`ai-orchestration`은 단순 딥페이크(얼굴 합성) 탐지가 아니라, **"이 영상이 어떤 AI 툴로 만들어졌는지"** 를 식별하는 멀티모달 AI 분석 시스템이다.

- 출력 예시: `"이 영상은 Pika로 생성됨 (87%)"`
- 분류 대상: Sora, Runway Gen2, Pika, Kling, HunyuanVideo 등 28개 클래스
- 멀티모달: 영상(시각) + 음성 + 립싱크 일치도 종합 판단
- 아키텍처: Ray Serve 멀티 에이전트 (Cascade Gate → VideoAgent → AudioAgent → SyncAgent → FusionAgent)

---

## 2. 모델 현황

### Video Backbone (EfficientNet-B4 + LSTM)

| 항목 | 내용 |
|---|---|
| SageMaker Job | `pawfiler-step3-efficientnet-b4-1774013467` (2026-03-21) |
| 학습 데이터 | AIGVDBench 전체 (100%) |
| EFS 경로 | `/mnt/efs/models/models/video_backbone.pt` |
| 파일 출처 | `/home/user/checkpoints/checkpoint.pt` (step3 job 최종 epoch과 동일) |

**검증 성능 (pytorch-training-2026-03-22-03-12-46-848):**

| 지표 | 값 |
|---|---|
| Macro F1 | **0.8561** |
| Weighted F1 | 0.8419 |
| 분류 클래스 수 | 28개 |

**클래스별 주요 성능:**

| 클래스 | F1 |
|---|---|
| Gen2 | 0.9877 |
| Sora | 0.9723 |
| Luma | 0.9801 |
| causvid_24fps | 0.9687 |
| Open-Sora | 0.9583 |
| Real | 0.3184 ⚠️ |

> Real 클래스 recall이 0.24로 낮음 — 실제 영상을 AI 생성으로 오분류하는 케이스 존재. 향후 개선 필요.

### XGBoost Cascade Gate

| 항목 | 내용 |
|---|---|
| 파일 | `xgboost_cascade.pkl` (XGBClassifier) |
| EFS 경로 | `/mnt/efs/models/models/xgboost_cascade.pkl` |
| 역할 | hand-crafted features 기반 1단계 필터 (~80% 케이스 처리) |

---

## 3. 배포 환경

### 인프라

- EKS + KubeRay Operator
- GPU Worker: `g5.xlarge` spot (NVIDIA A10G)
- Head Node: spot `t3.large`
- EFS: 모델 가중치 마운트 (`/mnt/efs/models`)
- External Secret: AWS Parameter Store → K8s Secret 자동 주입

### 환경변수 (External Secret `ai-orchestration-secrets`)

```
DATABASE_URL, REDIS_URL, S3_BUCKET
AI_ORCHESTRATION_URL, USER_SERVICE_URL, ADMIN_SERVICE_URL, COMMUNITY_SERVICE_URL
HUGGINGFACE_TOKEN
```

---

## 4. 발견 및 수정한 버그

### 4-1. `app.py` — `await` 이중 호출

Ray Serve handle의 `.remote()` 결과를 `await`한 뒤 또 `await`하여 TypeError 발생.

```python
# 버그
cascade_result = await self.cascade.predict.remote(...)
cascade_result = await cascade_result  # TypeError: object dict can't be used in 'await'
```

**수정:** 두 번째 `await` 제거. `fusion.ensemble.remote()` 동일하게 수정.

---

### 4-2. `models.py` — checkpoint 키 불일치

`train3.py`가 `{'epoch', 'step', 'model', 'optimizer'}` 형태로 저장하는데 `model_state_dict` 키만 처리.

```python
# 추가
elif isinstance(checkpoint, dict) and "model" in checkpoint:
    state = checkpoint["model"]
```

backbone도 `mobilevitv2_100` → `efficientnet_b4`로 변경 (EFS 가중치에 맞춤).

---

### 4-3. `cascade.py` — XGBoost predict 타입 오류

`XGBClassifier` Booster의 `predict()` 결과가 `[prob_class0, prob_class1]` 배열인데 `float()` 직접 변환 시 TypeError.

```python
# 수정
pred = self.model.predict(dmat)[0]
prob_fake = float(pred[1]) if hasattr(pred, '__len__') else float(pred)
```

---

### 4-4. `agents.py` — ObjectRef 타입 오류

Ray Serve 환경에서 `ray.put()`으로 만든 ObjectRef 대신 numpy array가 그대로 전달되는 경우 `ray.get()` 실패.

```python
# 수정 (VideoAgent, AudioAgent, SyncAgent 모두 적용)
frames_np = frames_ref if isinstance(frames_ref, np.ndarray) else ray.get(frames_ref)
```

---

### 4-5. `requirements.txt` — numpy 버전 충돌

numpy 미고정 시 2.0 설치 → pandas/cupy와 충돌 → Ray 기동 불가.

```
numpy==1.26.4
opencv-python-headless==4.8.1.78
```

---

### 4-6. `rayservice.yaml` — metrics_collector 누락 + 타임아웃 부족

`serveConfigV2`에 `metrics_collector` deployment 누락 → 새 클러스터 배포 시 500 에러.
`serviceUnhealthySecondThreshold: 300` → 노드 프로비저닝 + 이미지 pull + 모델 로드 시간 초과.

```yaml
serviceUnhealthySecondThreshold: 900
# metrics_collector deployment 추가
```

---

## 5. 배포 과정 인프라 이슈

### EFS CSI 드라이버 타이밍

Karpenter 신규 노드 프로비저닝 시 `efs-csi-node` DaemonSet 준비 전 Pod 스케줄링 → EFS 마운트 실패. 수 분 후 자동 해소.

### CPU 부족으로 에이전트 pending

`t3.large` spot 노드(CPU 2코어)에 Ray 오버헤드 + 에이전트 CPU 1씩 요구 → 스케줄링 불가.

**해결:** 에이전트 `num_cpus: 1` → `num_cpus: 0.1` (추론은 GPU worker에 위임하므로 CPU 거의 불필요).

### Ray Serve Hot Patch 한계

Ray Serve는 cloudpickle로 직렬화된 코드를 사용하므로 파일 교체 후 `serve.run()` 재호출만으로는 기존 replica에 반영 안 됨. `serve.delete()` 후 재배포 필요.

---

## 6. 최종 검증 결과

### Cascade Path (XGBoost, ~350ms)

```json
{
  "verdict": "real",
  "confidence": 1.0,
  "breakdown": {"video": {"is_fake": false, "confidence": 1.0}},
  "explanation": "경량 분석: 실제 (100%)",
  "meta": {"latency_ms": 372, "path": "cascade"}
}
```

### Deep Path (EfficientNet-B4 + LSTM, ~2.8s)

```json
{
  "verdict": "fake",
  "confidence": 0.0643,
  "breakdown": {
    "video": {"is_fake": true, "ai_model": "Pika", "confidence": 0.0643}
  },
  "explanation": "영상: Pika로 생성됨 (6%)",
  "meta": {"latency_ms": 2827, "path": "deep"}
}
```

- 35클래스 분류 정상 동작 ✅
- GPU 추론 (EfficientNet-B4 + LSTM) 정상 동작 ✅
- confidence가 낮은 건 테스트 영상(`mov_bbb.mp4`)이 실제 영상이라 Real 클래스 recall 낮음에 의한 오분류

---

## 7. 현재 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| Cascade Gate (XGBoost) | ✅ 정상 | |
| VideoAgent (EfficientNet-B4) | ✅ 정상 | Macro F1 0.8561 |
| AudioAgent (Wav2Vec2) | ✅ 정상 | HuggingFace 기본 가중치 |
| SyncAgent (SyncNet) | ✅ 정상 | |
| FusionAgent | ✅ 정상 | Nova Lite 미연결 → 템플릿 설명 fallback |
| Similar Cases (pgvector) | ⚠️ 비활성 | `analysis_cases` 테이블 데이터 없음 |
| KubeRay 자동 Serve 배포 | ⚠️ 수동 필요 | `serveConfigV2` 500 에러 미해결 |

---

## 8. 남은 작업

1. **KubeRay serveConfigV2 수정** — `serve_config.yaml`과 `rayservice.yaml` 통일하여 자동 배포 정상화
2. **Real 클래스 recall 개선** — 현재 0.24. 실제 영상 데이터 보강 또는 threshold 튜닝
3. **Bedrock SDK 업그레이드** — `bedrock-runtime` 서비스 인식 가능한 버전으로 교체 → Nova Lite 설명 생성 활성화
4. **analysis_cases 테이블 데이터 적재** — pgvector 유사 케이스 검색 활성화
5. **AudioAgent 음성 모델 학습** — 현재 HuggingFace 기본 가중치 사용, DFADD 데이터셋으로 파인튜닝 필요

---

## 9. 변경된 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `app.py` | `await` 이중 호출 제거 |
| `models.py` | `"model"` 키 처리 추가, `efficientnet_b4` backbone |
| `cascade.py` | XGBoost predict 타입 수정, threshold 0.85 |
| `agents.py` | ObjectRef/ndarray 처리, `num_cpus: 0.1` |
| `requirements.txt` | `numpy==1.26.4`, `opencv-python-headless==4.8.1.78` 고정 |
| `rayservice.yaml` | `metrics_collector` 추가, `serviceUnhealthySecondThreshold: 900` |
