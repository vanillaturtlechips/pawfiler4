# AIOps

5분 주기 클러스터 이상 탐지 에이전트 + HTTP API 서버

## 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | /status | 최근 분석 결과 + 파드 상태 |
| GET | /history | 분석 히스토리 (최근 20개) |
| GET | /alerts | 이상 감지 목록 |
| POST | /ask | 자유 질문 → Claude 실시간 조회 후 답변 |
| GET | /health | 헬스체크 |

## 로컬 실행

```bash
cd aiops
pip install -r requirements.txt

# MOCK_MODE=true: K8s/Loki 없이 가짜 데이터로 실행 (클러스터 불필요)

# Linux/Mac
MOCK_MODE=true python main.py

# Windows PowerShell
$env:MOCK_MODE="true"; python main.py
```

API 확인: http://localhost:8090/health

## 실제 클러스터 연결 테스트

클러스터가 올라와 있을 때 port-forward로 로컬에서 실제 데이터 테스트 가능:

```bash
# Loki 포트포워드
kubectl port-forward svc/loki 3100:3100 -n monitoring

# Prometheus 포트포워드
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring

# 환경변수 설정 후 실행 (MOCK_MODE=false)
MOCK_MODE=false \
LOKI_ENDPOINT=http://localhost:3100 \
PROMETHEUS_LOCAL=http://localhost:9090 \
python main.py
```

AMP는 AWS credentials만 있으면 클러스터 없이도 직접 쿼리 가능.

## 주의사항

- `MOCK_MODE=true` 상태에서는 분석 스케줄러가 실행되지 않음
- `/tmp/aiops_history.json` 에 분석 결과 저장 (파드 재시작 시 초기화)
- 프로덕션 배포 시 반드시 `MOCK_MODE=false` (기본값) 확인

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| MOCK_MODE | false | true: mock 데이터, false: 실제 클러스터 |
| API_PORT | 8090 | FastAPI 포트 |
| ANALYSIS_INTERVAL_MINUTES | 5 | 분석 주기 (분) |
| BEDROCK_REGION | us-east-1 | Bedrock 리전 |
| AMP_ENDPOINT | (하드코딩) | AMP 워크스페이스 URL |
| LOKI_ENDPOINT | http://loki.monitoring... | Loki 엔드포인트 |
