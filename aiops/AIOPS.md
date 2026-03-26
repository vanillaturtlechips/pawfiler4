# PawFiler AIOps 엔진

AWS Bedrock(Claude) Tool Use 기반의 자율 분석 에이전트.
5분마다 EKS 클러스터 전체를 점검하고, 이상 감지 시 자동 복구 + Slack/SNS 알림을 수행한다.

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                      main.py                            │
│  적응형 스케줄러 (5분 → 이상 시 1분 → 정상 복귀 5분)     │
└──────────────────────────┬──────────────────────────────┘
                           │ run_analysis() 호출
┌──────────────────────────▼─────────────────────────────┐
│                    analyzer.py                         │
│  Bedrock Converse API — Tool Use 루프 (최대 10라운드)      │
│                                                        │
│  Claude가 스스로 판단해서 아래 도구들을 순서대로 호출:            │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │get_pod_status   │  │describe_pod_    │              │
│  │(K8s 파드 상태)    │  │events(이벤트)     │              │
│  └─────────────────┘  └─────────────────┘              │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │get_prometheus_  │  │get_loki_logs    │              │
│  │metrics(PromQL)  │  │(LogQL)          │              │
│  └─────────────────┘  └─────────────────┘              │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │get_tempo_traces │  │restart_         │              │
│  │(Tempo TraceQL)  │  │deployment       │              │
│  └─────────────────┘  └─────────────────┘              │
└──────────────────────────┬──────────────────────────────┘
          이상 감지 시      │
┌─────────────────────────▼──────────────────────────────┐
│  알림 (1시간 쿨다운)                                       │
│  ├── SNS → 이메일/SMS                                    │
│  └── Slack Incoming Webhook                            │
└────────────────────────────────────────────────────────┘
          분석 결과 저장     │
┌─────────────────────────▼──────────────────────────────┐
│  store.py  (/tmp/aiops_history.json, 최근 50건)          │
└────────────────────────────────────────────────────────┘
          REST API 제공    │
┌─────────────────────────▼──────────────────────────────┐
│  api.py (FastAPI)                                      │
│  GET  /status   /history   /alerts                     │
│  GET  /metrics  /logs  /traces                         │
│  POST /ask  (자유 질문 → Claude 실시간 분석)                │
└────────────────────────────────────────────────────────┘
```

---

## Tool Use 루프 상세 동작

### 핵심 개념

Bedrock Converse API는 Claude와 사람/시스템 간 **대화 히스토리**를 주고받는 방식이다.
`stop_reason` 값으로 루프를 제어한다:

| stop_reason | 의미                               | 다음 동작                                      |
| ----------- | ---------------------------------- | ---------------------------------------------- |
| `tool_use`  | Claude가 도구 호출을 요청함        | 도구 실행 후 결과를 messages에 추가하고 재호출 |
| `end_turn`  | Claude가 최종 텍스트 응답을 완성함 | 루프 종료, 텍스트 반환                         |

### 라운드별 흐름

```
messages = [{"role": "user", "content": "클러스터 점검하세요"}]

── Round 1 ──────────────────────────────────────────────
  bedrock.converse(messages) 호출
  Claude 응답: stop_reason = "tool_use"
    → toolUse: { name: "get_pod_status", input: {namespace: "pawfiler"} }

  messages에 assistant 응답 추가:
    {"role": "assistant", "content": [toolUse 블록]}

── Round 2 ──────────────────────────────────────────────
  get_pod_status(namespace="pawfiler") 실제 실행
    → K8s API 호출 → 파드 목록 + 이상 파드 반환

  messages에 tool 결과 추가:
    {"role": "user", "content": [{"toolResult": {"toolUseId": "...", "content": 결과JSON}}]}

  bedrock.converse(messages) 재호출
  Claude 응답: stop_reason = "tool_use"
    → toolUse: { name: "describe_pod_events", input: {pod_name: "quiz-xxx"} }

  ... (같은 패턴 반복)

── Round N ──────────────────────────────────────────────
  모든 필요한 정보 수집 완료
  Claude 응답: stop_reason = "end_turn"
    → text: "분석 결과: ... 이상 감지 여부: YES/NO"

  루프 종료
```

### 왜 10라운드인가?

- 정상 케이스: 4~5라운드면 충분 (파드 조회 → 메트릭 → 로그 → 최종 보고)
- 이상 케이스: 6~8라운드 (파드 → 이벤트 → 메트릭 → 로그 → 트레이스 → restart → 최종 보고)
- 10라운드 = 무한루프 방지 안전장치 (버그나 Claude가 반복 도구 호출 시)
- 10라운드 초과 시 `"분석 최대 라운드 초과."` 반환

### Claude가 도구를 선택하는 기준

System prompt에 분석 순서를 명시하되, **Claude가 상황에 따라 유연하게 판단**:

- 이상 파드 없으면 `describe_pod_events` 건너뜀
- CPU/메모리 정상이면 `predict_linear` 쿼리 생략
- Tempo 미설정이면 `get_tempo_traces`가 "unavailable" 반환 → 무시하고 진행
- CrashLoopBackOff 확인 시에만 `restart_deployment` 호출

---

## 적응형 스케줄러 (main.py)

```
정상 상태           이상 감지            정상 복귀
  │                    │                    │
  ▼                    ▼                    ▼
5분 간격 ──────→ 1분 간격 ──────→ 연속 3회 정상 ──→ 5분 간격
                                    카운터 초기화
```

- 이상 감지(`anomaly=True`) 즉시 폴링 주기 5분 → 1분으로 단축
- 1분 간격으로 점검하다가 연속 3회 정상 판정 → 다시 5분으로 복귀
- 이유: 장애 발생 직후 빠른 복구 확인, 복구 후 불필요한 Bedrock 호출 감소

---

## Slack 알림 중복 방지 (쿨다운)

`/tmp/aiops_last_alert.json`에 마지막 알림 타임스탬프 저장.
이상 감지 후 **1시간(3600초) 이내** 재감지는 Slack/SNS 발송 억제.

```python
COOLDOWN_SECONDS = 3600

def _cooldown_active() -> bool:
    last_alert = 파일에서 로드
    return (현재시각 - last_alert) < 3600
```

주의: `/tmp/`는 휘발성 — 파드 재시작 시 쿨다운 초기화됨.
연속 재시작 상황에서는 Slack이 반복 발송될 수 있음.

---

## 예측 분석 (predict_linear)

CPU/메모리가 임계값(75%) 초과 시 Claude가 자동으로 `predict_linear` 쿼리를 실행:

```promql
# 현재 추세로 1시간 후 메모리 예상값 (bytes)
predict_linear(container_memory_working_set_bytes{namespace="pawfiler"}[30m], 3600)

# 현재 추세로 1시간 후 CPU 예상 사용률
predict_linear(rate(container_cpu_usage_seconds_total{namespace="pawfiler"}[5m])[30m:], 3600)
```

분석 리포트에 `"현재 추세 지속 시 1시간 후 예상값: XXX"` 형태로 포함.

---

## Tempo 트레이스 연동

`TEMPO_ENDPOINT` 환경변수 설정 여부로 활성화:

| 상태   | 동작                                                                               |
| ------ | ---------------------------------------------------------------------------------- |
| 미설정 | `get_tempo_traces` → `{"source": "unavailable"}` 반환, Claude가 무시하고 분석 계속 |
| 설정됨 | 실제 Tempo HTTP API 호출 (`/api/search`)                                           |

활성화 후 Claude가 자동으로 고레이턴시(≥2초) 또는 에러 상태 트레이스를 조회.

---

## API 엔드포인트 요약

| 엔드포인트                          | 설명                                     | 데이터 소스            |
| ----------------------------------- | ---------------------------------------- | ---------------------- |
| `GET /status`                       | 최근 분석 결과 + 파드 상태 + 메트릭 요약 | store.py 캐시          |
| `GET /history?limit=20`             | 분석 히스토리 목록                       | store.py               |
| `GET /alerts?limit=20`              | 이상 감지 목록만 필터                    | store.py               |
| `GET /metrics?service=quiz-service` | 서비스별 CPU/메모리/RPS/레이턴시         | AMP PromQL             |
| `GET /logs?service=...&level=error` | 서비스별 최근 로그                       | Loki LogQL             |
| `GET /traces?service=...&limit=20`  | 최근 분산 트레이스                       | Tempo (미설정 시 mock) |
| `POST /ask` `{"question": "..."}`   | 자유 질문 → Claude 실시간 분석 응답      | Bedrock Tool Use       |
| `GET /health`                       | 서비스 상태 + mock/tempo 연결 여부       | -                      |

### MOCK_MODE

`MOCK_MODE=true` 환경변수 설정 시 모든 엔드포인트가 정적 mock 데이터 반환.
AWS/K8s 연결 없이 프론트엔드 개발/테스트 용도.

---

## 환경변수

| 변수                 | 기본값                                        | 설명                                                     |
| -------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `BEDROCK_REGION`     | `us-east-1`                                   | Bedrock 리전 (ap-northeast-2 미지원 모델은 cross-region) |
| `BEDROCK_MODEL_ID`   | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | 사용 모델                                                |
| `AWS_REGION`         | `ap-northeast-2`                              | AMP/SNS/K8s 리전                                         |
| `AMP_ENDPOINT`       | AMP 워크스페이스 URL                          | Amazon Managed Prometheus                                |
| `PROMETHEUS_LOCAL`   | cluster 내부 주소                             | AMP 실패 시 폴백                                         |
| `LOKI_ENDPOINT`      | cluster 내부 주소                             | Loki HTTP API                                            |
| `TEMPO_ENDPOINT`     | `""` (미설정)                                 | Tempo HTTP API (설정 시 트레이스 활성화)                 |
| `SNS_TOPIC_ARN`      | pawfiler-aiops ARN                            | 이상 알림 SNS 토픽                                       |
| `SLACK_WEBHOOK_URL`  | `""` (미설정)                                 | Slack Incoming Webhook (설정 시 활성화)                  |
| `MOCK_MODE`          | `false`                                       | `true` 설정 시 mock 데이터 반환                          |
| `AIOPS_HISTORY_FILE` | `/tmp/aiops_history.json`                     | 분석 히스토리 저장 경로                                  |

---

## 파일 구조

```
aiops/
├── main.py          # 적응형 스케줄러 + 서버 시작점
├── analyzer.py      # Bedrock Tool Use 루프 (run_analysis, ask_claude)
├── tools.py         # 6개 도구 구현 (Prometheus, Loki, K8s, Tempo, Slack, SNS)
├── api.py           # FastAPI REST 서버
├── store.py         # 분석 결과 저장/조회 (JSON 파일 기반)
└── AIOPS.md         # 이 문서
```
