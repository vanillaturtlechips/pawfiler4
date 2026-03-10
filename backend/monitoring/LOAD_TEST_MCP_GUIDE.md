# 🚀 Load Test MCP Server 사용 가이드

## 개요

자연어로 부하 테스트를 실행하고 모니터링할 수 있는 MCP 서버입니다.

## 설치

```bash
cd pawfiler4/backend/monitoring
pip install mcp k6
```

## Kiro IDE에서 사용

MCP 서버가 자동으로 연결되어 있습니다.

### 1. 부하 테스트 실행

#### 기본 사용

```
"quiz-service에 5000 RPS 부하 테스트 실행해줘"
```

실제 호출:

```python
run_load_test(
    service="quiz-service",
    rps=5000,
    duration="5m"
)
```

#### 상세 설정

```
"video-analysis 서비스에 스트레스 테스트 실행해줘.
100 RPS로 시작해서 10분 동안 500 RPS까지 올려줘"
```

실제 호출:

```python
run_load_test(
    service="video-analysis",
    rps=500,
    duration="10m",
    vus=100,
    scenario="stress"
)
```

#### 스파이크 테스트

```
"bff 서비스에 스파이크 테스트 해줘.
갑자기 1000 RPS로 올렸다가 다시 내려줘"
```

실제 호출:

```python
run_load_test(
    service="bff",
    rps=1000,
    duration="5m",
    scenario="spike"
)
```

### 2. 테스트 결과 조회

```
"방금 실행한 테스트 결과 보여줘"
```

실제 호출:

```python
get_test_results(test_id="quiz-service-20260309-120000")
```

### 3. 테스트 목록 조회

```
"최근 실행한 부하 테스트 10개 보여줘"
```

실제 호출:

```python
list_tests(limit=10)
```

### 4. 테스트 중지

```
"실행 중인 테스트 중지해줘"
```

실제 호출:

```python
stop_test(test_id="quiz-service-20260309-120000")
```

### 5. SLO 모니터링

```
"quiz-service의 SLO 달성률 확인해줘"
```

실제 호출:

```python
monitor_slo(
    service="quiz-service",
    duration="5m"
)
```

### 6. 테스트 비교

```
"어제 테스트랑 오늘 테스트 비교해줘"
```

실제 호출:

```python
compare_tests(
    test_id_1="quiz-service-20260308-120000",
    test_id_2="quiz-service-20260309-120000"
)
```

## 사용 가능한 도구

### 1. run_load_test

**부하 테스트 실행**

```python
run_load_test(
    service="quiz-service",      # 대상 서비스
    rps=5000,                     # 목표 RPS
    duration="5m",                # 지속 시간
    vus=100,                      # 가상 사용자 수
    scenario="load"               # 시나리오 타입
)
```

**시나리오 타입:**

- `load`: 일정한 부하 (기본값)
- `stress`: 점진적 증가
- `spike`: 급격한 증가/감소
- `soak`: 장시간 안정성 테스트

**응답:**

```json
{
  "test_id": "quiz-service-20260309-120000",
  "status": "started",
  "service": "quiz-service",
  "rps": 5000,
  "duration": "5m",
  "message": "부하 테스트가 시작되었습니다"
}
```

### 2. get_test_results

**테스트 결과 조회**

```python
get_test_results(test_id="quiz-service-20260309-120000")
```

**응답:**

```json
{
  "test_id": "quiz-service-20260309-120000",
  "service": "quiz-service",
  "rps": 5000,
  "duration": "5m",
  "status": "completed",
  "started_at": "2026-03-09T12:00:00",
  "total_requests": 150000,
  "summary": "..."
}
```

### 3. list_tests

**테스트 목록 조회**

```python
list_tests(limit=10)
```

**응답:**

```json
{
  "total": 10,
  "tests": [
    {
      "test_id": "quiz-service-20260309-120000",
      "service": "quiz-service",
      "rps": 5000,
      "duration": "5m",
      "started_at": "2026-03-09T12:00:00",
      "status": "completed"
    }
  ]
}
```

### 4. stop_test

**테스트 중지**

```python
stop_test(test_id="quiz-service-20260309-120000")
```

### 5. monitor_slo

**SLO 모니터링**

```python
monitor_slo(
    service="quiz-service",
    duration="5m"
)
```

**응답:**

```json
{
  "service": "quiz-service",
  "slo_status": {
    "availability": {
      "target": 99.5,
      "current": 99.7,
      "status": "✓ PASS"
    },
    "latency_p95": {
      "target": 2000,
      "current": 1850,
      "unit": "ms",
      "status": "✓ PASS"
    },
    "error_rate": {
      "target": 1.0,
      "current": 0.5,
      "unit": "%",
      "status": "✓ PASS"
    }
  }
}
```

### 6. generate_k6_script

**커스텀 K6 스크립트 생성**

```python
generate_k6_script(
    service="quiz-service",
    endpoints=["/quiz/random", "/quiz/submit"],
    scenario_type="load"
)
```

### 7. compare_tests

**테스트 비교**

```python
compare_tests(
    test_id_1="quiz-service-20260308-120000",
    test_id_2="quiz-service-20260309-120000"
)
```

## 실제 사용 예시

### 시나리오 1: 새 기능 배포 전 부하 테스트

```
사용자: "quiz-service에 배포 전 부하 테스트 해줘.
        평소 트래픽의 2배인 2000 RPS로 10분간 테스트해줘"

AI: run_load_test(
      service="quiz-service",
      rps=2000,
      duration="10m",
      scenario="load"
    )

결과:
- Test ID: quiz-service-20260309-120000
- Status: Started
- 10분 후 결과 확인 가능
```

### 시나리오 2: 스파이크 대응 테스트

```
사용자: "video-analysis 서비스가 갑자기 트래픽 몰릴 때
        버틸 수 있는지 테스트해줘"

AI: run_load_test(
      service="video-analysis",
      rps=1000,
      duration="5m",
      scenario="spike"
    )

결과:
- 정상 부하 → 10배 스파이크 → 정상 부하
- SLO 달성 여부 확인
```

### 시나리오 3: SLO 검증

```
사용자: "quiz-service가 SLO 목표 달성하고 있는지 확인해줘"

AI: monitor_slo(
      service="quiz-service",
      duration="1h"
    )

결과:
- 가용성: 99.7% (목표: 99.5%) ✓
- P95 응답시간: 1.8초 (목표: 2초) ✓
- 에러율: 0.5% (목표: 1%) ✓
```

### 시나리오 4: 성능 개선 검증

```
사용자: "어제 최적화 전 테스트랑 오늘 테스트 비교해줘"

AI: compare_tests(
      test_id_1="quiz-service-20260308-120000",
      test_id_2="quiz-service-20260309-120000"
    )

결과:
- P95 응답시간: 2.5초 → 1.8초 (28% 개선)
- 처리량: 1500 RPS → 2000 RPS (33% 증가)
- 에러율: 1.2% → 0.5% (58% 감소)
```

## 지원하는 서비스

- `quiz-service`: 퀴즈 서비스
- `video-analysis`: 비디오 분석 서비스
- `community-service`: 커뮤니티 서비스
- `admin-service`: 관리자 서비스
- `bff`: Backend for Frontend

## 테스트 결과 저장

모든 테스트 결과는 `pawfiler4/backend/monitoring/test_results/` 디렉토리에 저장됩니다.

```
test_results/
├── quiz-service-20260309-120000.json          # 상세 결과
├── quiz-service-20260309-120000_summary.txt   # 요약
└── quiz-service-20260309-120000_metadata.json # 메타데이터
```

## Grafana 대시보드 연동

K6 결과는 자동으로 Prometheus로 전송되어 Grafana에서 실시간 모니터링 가능합니다.

```
http://localhost:3001/d/k6-dashboard
```

## 트러블슈팅

### K6가 설치되지 않음

```bash
# Windows
choco install k6

# Mac
brew install k6

# Linux
sudo apt-get install k6
```

### 테스트가 시작되지 않음

```bash
# K6 버전 확인
k6 version

# 스크립트 수동 실행
k6 run pawfiler4/backend/monitoring/k6/load_test.js
```

### 결과 파일이 생성되지 않음

```bash
# 디렉토리 권한 확인
ls -la pawfiler4/backend/monitoring/test_results/

# 디렉토리 생성
mkdir -p pawfiler4/backend/monitoring/test_results
```

## 고급 사용법

### 커스텀 엔드포인트 테스트

```python
generate_k6_script(
    service="quiz-service",
    endpoints=[
        "/quiz/random",
        "/quiz/submit",
        "/quiz/leaderboard"
    ],
    scenario_type="load"
)
```

### 장시간 안정성 테스트 (Soak Test)

```python
run_load_test(
    service="quiz-service",
    rps=1000,
    duration="2h",  # 2시간
    scenario="soak"
)
```

### 점진적 부하 증가 (Stress Test)

```python
run_load_test(
    service="quiz-service",
    rps=5000,  # 최대 RPS
    duration="30m",
    scenario="stress"
)
```

## 베스트 프랙티스

1. **배포 전 테스트**: 새 기능 배포 전 반드시 부하 테스트 실행
2. **SLO 검증**: 주기적으로 SLO 달성률 확인
3. **점진적 증가**: 처음부터 높은 부하보다 점진적으로 증가
4. **결과 비교**: 이전 테스트와 비교하여 성능 추이 파악
5. **실제 트래픽 패턴**: 실제 사용자 패턴을 반영한 테스트

## 참고 자료

- [K6 Documentation](https://k6.io/docs/)
- [Prometheus Metrics](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)
- [SLO Guide](./SLO.md)

---

**자연어로 간단하게 부하 테스트를 실행하고 모니터링하세요!** 🚀
