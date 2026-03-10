# PawFiler Video Analysis Service - SLO (Service Level Objectives)

## 📊 SLO 개요

### SLI (Service Level Indicators)

서비스 품질을 측정하는 지표

### SLO (Service Level Objectives)

목표로 하는 서비스 수준

### SLA (Service Level Agreement)

고객과의 계약상 보장 수준 (SLO보다 낮게 설정)

---

## 🎯 핵심 SLO

### 1. 가용성 (Availability)

**목표: 99.5% (월간 기준)**

```
SLI: 성공한 요청 수 / 전체 요청 수
SLO: 99.5% 이상
SLA: 99.0% 이상

허용 다운타임:
- 월간: 3.6시간
- 주간: 50분
- 일간: 7분
```

**측정 방법:**

```promql
# Prometheus Query
sum(rate(mcp_requests_total{status="success"}[5m]))
/
sum(rate(mcp_requests_total[5m])) * 100
```

**알림 임계값:**

- Warning: < 99.5% (5분간)
- Critical: < 99.0% (1분간)

---

### 2. 응답 시간 (Latency)

#### 2.1 일반 분석 (Fast Pass 미적용)

**목표: P95 < 2초, P99 < 5초**

```
SLI: 요청 처리 시간 (초)
SLO:
  - P50: < 800ms
  - P95: < 2000ms (2초)
  - P99: < 5000ms (5초)
```

**측정 방법:**

```promql
# P95
histogram_quantile(0.95,
  rate(mcp_request_duration_seconds_bucket{tool_name="analyze_frames"}[5m])
)

# P99
histogram_quantile(0.99,
  rate(mcp_request_duration_seconds_bucket{tool_name="analyze_frames"}[5m])
)
```

**알림 임계값:**

- Warning: P95 > 2.5초
- Critical: P95 > 3초

#### 2.2 Fast Pass 적용

**목표: P95 < 200ms, P99 < 500ms**

```
SLI: Fast Pass 요청 처리 시간 (초)
SLO:
  - P50: < 100ms
  - P95: < 200ms
  - P99: < 500ms
```

**측정 방법:**

```promql
histogram_quantile(0.95,
  rate(mcp_request_duration_seconds_bucket{
    tool_name="analyze_frames",
    fast_pass="true"
  }[5m])
)
```

---

### 3. Fast Pass 적중률 (Cache Hit Rate)

**목표: 20% 이상**

```
SLI: Fast Pass 적중 수 / 전체 분석 요청 수
SLO: 20% 이상
목표: 30% 이상
```

**측정 방법:**

```promql
sum(rate(mcp_fast_pass_hits_total[5m]))
/
(sum(rate(mcp_fast_pass_hits_total[5m])) + sum(rate(mcp_fast_pass_misses_total[5m])))
* 100
```

**알림 임계값:**

- Warning: < 15% (1시간)
- Info: < 20% (1시간)

---

### 4. 에러율 (Error Rate)

**목표: < 1%**

```
SLI: 실패한 요청 수 / 전체 요청 수
SLO: < 1%
SLA: < 2%
```

**측정 방법:**

```promql
sum(rate(mcp_requests_total{status="error"}[5m]))
/
sum(rate(mcp_requests_total[5m]))
* 100
```

**알림 임계값:**

- Warning: > 1% (5분간)
- Critical: > 2% (1분간)

---

### 5. 처리량 (Throughput)

**목표: 100 req/min 이상**

```
SLI: 분당 처리된 요청 수
SLO: 100 req/min 이상
목표: 200 req/min 이상
```

**측정 방법:**

```promql
sum(rate(mcp_requests_total[1m])) * 60
```

**알림 임계값:**

- Warning: < 50 req/min (10분간)
- Info: < 100 req/min (10분간)

---

## 📈 도구별 SLO

### analyze_frames (딥페이크 탐지)

```yaml
Latency:
  P50: < 800ms
  P95: < 2000ms
  P99: < 5000ms

Success Rate: > 99%

Fast Pass:
  Hit Rate: > 20%
  Latency P95: < 200ms
```

### get_frame_sample (프레임 추출)

```yaml
Latency:
  P50: < 100ms
  P95: < 200ms
  P99: < 500ms

Success Rate: > 99.5%
```

### extract_embedding (임베딩 생성)

```yaml
Latency:
  P50: < 50ms
  P95: < 100ms
  P99: < 200ms

Success Rate: > 99.5%
```

### search_similar_videos (유사도 검색)

```yaml
Latency:
  P50: < 100ms
  P95: < 200ms
  P99: < 500ms

Success Rate: > 99%
```

### explain_result (결과 설명)

```yaml
Latency:
  P50: < 50ms
  P95: < 100ms
  P99: < 200ms

Success Rate: > 99.5%
```

---

## 🔍 인프라 SLO

### 데이터베이스 (PostgreSQL)

```yaml
Availability: > 99.9%

Query Latency:
  P95: < 100ms
  P99: < 500ms

Connection Pool:
  Utilization: < 80%
```

### 메시지 큐 (Kafka/MSK)

```yaml
Availability: > 99.9%

Message Lag: < 1000 messages

Publish Latency:
  P95: < 50ms
  P99: < 100ms
```

### 스토리지 (S3)

```yaml
Availability: > 99.99%

Upload Latency:
  P95: < 2000ms
  P99: < 5000ms

Download Latency:
  P95: < 1000ms
  P99: < 3000ms
```

---

## 📊 Error Budget

### 월간 Error Budget (99.5% 가용성 기준)

```
총 시간: 720시간 (30일)
허용 다운타임: 3.6시간 (216분)

일일 Error Budget: 7.2분
주간 Error Budget: 50.4분
```

### Error Budget 소진 정책

```yaml
소진율 < 25%:
  - 정상 운영
  - 새 기능 배포 가능

소진율 25-50%:
  - 주의 필요
  - 배포 검토 강화

소진율 50-75%:
  - 경고 상태
  - 긴급 배포만 허용
  - 안정성 개선 우선

소진율 > 75%:
  - 위기 상태
  - 모든 배포 중단
  - 안정성 복구에 집중
```

---

## 🎯 비즈니스 SLO

### 분석 정확도

```yaml
Deepfake Detection:
  Precision: > 85%
  Recall: > 80%
  F1 Score: > 82%

False Positive Rate: < 15%
False Negative Rate: < 20%
```

### 사용자 경험

```yaml
First Contentful Paint: < 1.5초
Time to Interactive: < 3초
Total Blocking Time: < 300ms
```

---

## 📉 SLO 모니터링 대시보드

### Grafana 대시보드 구성

#### 1. Overview Dashboard

```
- 전체 가용성 (실시간)
- 요청 처리량 (req/min)
- 평균 응답 시간
- 에러율
- Fast Pass 적중률
```

#### 2. Latency Dashboard

```
- P50, P95, P99 응답 시간 (도구별)
- Fast Pass vs 일반 분석 비교
- 시간대별 응답 시간 분포
```

#### 3. Error Budget Dashboard

```
- 월간 Error Budget 소진율
- 일일 Error Budget 추이
- 인시던트 타임라인
```

#### 4. Business Metrics Dashboard

```
- 분석 정확도 추이
- 사용자 만족도
- 비용 효율성
```

---

## 🚨 알림 규칙

### Critical (즉시 대응)

```yaml
- 가용성 < 99% (1분간)
- 에러율 > 2% (1분간)
- P95 응답시간 > 3초 (5분간)
- 데이터베이스 다운
```

### Warning (30분 내 대응)

```yaml
- 가용성 < 99.5% (5분간)
- 에러율 > 1% (5분간)
- P95 응답시간 > 2.5초 (10분간)
- Fast Pass 적중률 < 15% (1시간)
```

### Info (모니터링)

```yaml
- 처리량 < 100 req/min (10분간)
- Fast Pass 적중률 < 20% (1시간)
- Error Budget 소진율 > 50%
```

---

## 📝 SLO 검토 주기

### 주간 검토

- SLO 달성률 확인
- Error Budget 소진율 분석
- 인시던트 리뷰

### 월간 검토

- SLO 목표 재평가
- 트렌드 분석
- 개선 계획 수립

### 분기 검토

- SLO 목표 조정
- 새로운 SLI 추가
- 비즈니스 목표 정렬

---

## 🔧 SLO 개선 전략

### 가용성 개선

```
1. Multi-AZ 배포
2. Auto Scaling 최적화
3. Circuit Breaker 패턴
4. Graceful Degradation
```

### 응답 시간 개선

```
1. Fast Pass 최적화
2. 데이터베이스 인덱싱
3. 캐싱 전략 강화
4. 비동기 처리
```

### Fast Pass 적중률 개선

```
1. 임계값 조정 (0.97 → 0.95)
2. 캐시 크기 확대 (100 → 500)
3. 벡터 인덱스 최적화
4. 사전 워밍업
```

---

## 📊 SLO 계산 예시

### 월간 가용성 계산

```python
# 30일 기준
total_minutes = 30 * 24 * 60  # 43,200분
downtime_minutes = 216  # 3.6시간

availability = (total_minutes - downtime_minutes) / total_minutes * 100
# = 99.5%
```

### Error Budget 소진율

```python
# 실제 다운타임: 1.5시간 (90분)
# 허용 다운타임: 3.6시간 (216분)

burn_rate = 90 / 216 * 100
# = 41.67%
```

### Fast Pass 적중률

```python
# Fast Pass 적중: 200건
# Fast Pass 미적중: 800건

hit_rate = 200 / (200 + 800) * 100
# = 20%
```

---

## 🎯 목표 로드맵

### Phase 1 (현재)

```
- 가용성: 99.5%
- P95 응답시간: < 2초
- Fast Pass 적중률: > 20%
```

### Phase 2 (3개월)

```
- 가용성: 99.7%
- P95 응답시간: < 1.5초
- Fast Pass 적중률: > 30%
```

### Phase 3 (6개월)

```
- 가용성: 99.9%
- P95 응답시간: < 1초
- Fast Pass 적중률: > 40%
```

---

## 📚 참고 자료

### Prometheus Queries

```promql
# 가용성
sum(rate(mcp_requests_total{status="success"}[5m])) / sum(rate(mcp_requests_total[5m])) * 100

# P95 응답시간
histogram_quantile(0.95, rate(mcp_request_duration_seconds_bucket[5m]))

# Fast Pass 적중률
sum(rate(mcp_fast_pass_hits_total[5m])) / (sum(rate(mcp_fast_pass_hits_total[5m])) + sum(rate(mcp_fast_pass_misses_total[5m]))) * 100

# 에러율
sum(rate(mcp_requests_total{status="error"}[5m])) / sum(rate(mcp_requests_total[5m])) * 100

# 처리량
sum(rate(mcp_requests_total[1m])) * 60
```

### Grafana Alert Rules

```yaml
- alert: HighErrorRate
  expr: sum(rate(mcp_requests_total{status="error"}[5m])) / sum(rate(mcp_requests_total[5m])) > 0.01
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High error rate detected"

- alert: SlowResponse
  expr: histogram_quantile(0.95, rate(mcp_request_duration_seconds_bucket[5m])) > 2
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "P95 latency exceeds 2 seconds"
```

---

## ✅ SLO 체크리스트

### 일일 체크

- [ ] 가용성 > 99.5%
- [ ] 에러율 < 1%
- [ ] P95 응답시간 < 2초
- [ ] Error Budget 소진율 확인

### 주간 체크

- [ ] SLO 달성률 리포트
- [ ] 인시던트 분석
- [ ] 개선 액션 아이템

### 월간 체크

- [ ] SLO 목표 달성 여부
- [ ] Error Budget 정산
- [ ] 다음 달 목표 설정

---

**PawFiler Video Analysis Service SLO는 서비스 품질을 보장하고 지속적인 개선을 위한 기준입니다.**
