# 🚀 PawFiler 모니터링 & 부하 테스트

## 개요

PawFiler 프로젝트의 모니터링 및 부하 테스트 시스템입니다.

## 구성 요소

### 1. Prometheus

메트릭 수집 및 저장

### 2. Grafana

메트릭 시각화 및 대시보드

### 3. K6

부하 테스트 도구

### 4. Load Test MCP Server

자연어로 부하 테스트를 실행하는 MCP 서버

## 빠른 시작

### 1. 모니터링 스택 시작

```bash
cd pawfiler4/backend
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### 2. 서비스 확인

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Alertmanager: http://localhost:9093

### 3. MCP 서버로 부하 테스트 실행

Kiro IDE에서:

```
"quiz-service에 5000 RPS 부하 테스트 실행해줘"
```

또는 직접 실행:

```bash
cd pawfiler4/backend/monitoring
python load_test_mcp_server.py
```

## 지원하는 서비스

### Quiz Service

- **엔드포인트**:
  - `POST /api/quiz/random` - 랜덤 퀴즈 조회
  - `POST /api/quiz/submit` - 답안 제출
  - `POST /api/quiz/stats` - 사용자 통계
- **K6 스크립트**: `k6/quiz_service_test.js`
- **포트**: 3000 (BFF 경유)

### Community Service

- **엔드포인트**:
  - `GET /api/community/feed` - 피드 조회
  - `GET /api/community/post` - 포스트 조회
  - `POST /api/community/post` - 포스트 생성
  - `POST /api/community/comment` - 댓글 작성
  - `POST /api/community/like` - 좋아요
- **K6 스크립트**: `k6/community_service_test.js`
- **포트**: 3000 (BFF 경유)

### Video Analysis Service

- **엔드포인트**:
  - `POST /analyze` - 비디오 분석
  - `GET /status` - 상태 확인
- **K6 스크립트**: `k6/video_analysis_test.js`
- **포트**: 9090

### Admin Service

- **엔드포인트**:
  - `GET /api/admin/questions` - 퀴즈 목록
  - `POST /api/admin/questions` - 퀴즈 생성
  - `PUT /api/admin/questions/:id` - 퀴즈 수정
  - `DELETE /api/admin/questions/:id` - 퀴즈 삭제
- **K6 스크립트**: `k6/admin_service_test.js`
- **포트**: 8082

### BFF (Backend for Frontend)

- **엔드포인트**: Quiz + Community 통합
- **K6 스크립트**: `k6/bff_test.js`
- **포트**: 3000

## MCP 도구 사용법

### 1. 부하 테스트 실행

```python
run_load_test(
    service="quiz-service",
    rps=5000,
    duration="5m",
    vus=100,
    scenario="load"
)
```

**시나리오 타입**:

- `load`: 일정한 부하
- `stress`: 점진적 증가
- `spike`: 급격한 증가
- `soak`: 장시간 안정성

### 2. 테스트 결과 조회

```python
get_test_results(test_id="quiz-service-20260309-120000")
```

### 3. 테스트 목록

```python
list_tests(limit=10)
```

### 4. SLO 모니터링

```python
monitor_slo(service="quiz-service", duration="5m")
```

## K6 스크립트 직접 실행

### Quiz Service 테스트

```bash
cd pawfiler4/backend/monitoring
k6 run k6/quiz_service_test.js
```

### Community Service 테스트

```bash
k6 run k6/community_service_test.js
```

### 커스텀 설정

```bash
k6 run -e BASE_URL=http://localhost:3000 k6/quiz_service_test.js
```

## SLO (Service Level Objectives)

### Quiz Service

- **가용성**: 99.5%
- **P95 응답시간**: < 2초
- **에러율**: < 1%

### Community Service

- **가용성**: 99.5%
- **P95 응답시간**: < 2초
- **에러율**: < 1%

### Video Analysis Service

- **가용성**: 99.5%
- **P95 응답시간**: < 5초 (일반), < 200ms (Fast Pass)
- **에러율**: < 1%

자세한 내용은 [SLO.md](../services/video-analysis/SLO.md) 참고

## 디렉토리 구조

```
monitoring/
├── k6/                          # K6 부하 테스트 스크립트
│   ├── quiz_service_test.js
│   ├── community_service_test.js
│   ├── video_analysis_test.js
│   ├── admin_service_test.js
│   └── bff_test.js
├── alerts/                      # Prometheus 알림 규칙
│   └── slo_alerts.yml
├── grafana/                     # Grafana 대시보드
│   ├── dashboards/
│   └── datasources/
├── test_results/                # 테스트 결과 저장
├── prometheus.yml               # Prometheus 설정
├── alertmanager.yml             # Alertmanager 설정
├── load_test_mcp_server.py      # MCP 서버
├── LOAD_TEST_MCP_GUIDE.md       # MCP 사용 가이드
└── README.md                    # 이 파일
```

## 실제 사용 예시

### 시나리오 1: 배포 전 부하 테스트

```
사용자: "quiz-service에 배포 전 부하 테스트 해줘. 2000 RPS로 10분간"

AI: run_load_test(
      service="quiz-service",
      rps=2000,
      duration="10m",
      scenario="load"
    )

결과:
- Test ID: quiz-service-20260309-120000
- Status: Started
- Service URL: http://localhost:3000
```

### 시나리오 2: 스파이크 테스트

```
사용자: "community-service 스파이크 테스트 해줘"

AI: run_load_test(
      service="community-service",
      rps=1000,
      duration="5m",
      scenario="spike"
    )
```

### 시나리오 3: SLO 검증

```
사용자: "quiz-service SLO 달성률 확인해줘"

AI: monitor_slo(
      service="quiz-service",
      duration="1h"
    )

결과:
- 가용성: 99.7% ✓
- P95 응답시간: 1.8초 ✓
- 에러율: 0.5% ✓
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

### 서비스에 연결할 수 없음

```bash
# 서비스 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs quiz-service
docker-compose logs bff
```

### 테스트 결과가 저장되지 않음

```bash
# 디렉토리 생성
mkdir -p pawfiler4/backend/monitoring/test_results

# 권한 확인
ls -la pawfiler4/backend/monitoring/test_results/
```

## 참고 자료

- [K6 Documentation](https://k6.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Load Test MCP Guide](./LOAD_TEST_MCP_GUIDE.md)
- [SLO Guide](../services/video-analysis/SLO.md)

---

**자연어로 간단하게 부하 테스트를 실행하세요!** 🚀
