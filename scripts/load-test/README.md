# Load Test Scripts

SLO/SLA 측정을 위한 부하 테스트 스크립트

## 📁 구조

```
scripts/load-test/
├── run.sh                    # 메인 실행 스크립트
├── analyze.py                # 결과 분석 스크립트
├── scenarios/                # k6 테스트 시나리오
│   ├── quiz-service.js
│   ├── community-service.js
│   └── admin-service.js
├── results/                  # 테스트 결과 (JSON)
│   ├── baseline/
│   ├── staging/
│   └── production/
└── reports/                  # 분석 리포트 (Markdown)
```

## 🚀 사용법

### 1. k6 설치

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. 테스트 실행

```bash
cd scripts/load-test

# 로컬 환경 테스트
./run.sh quiz local

# Staging 환경 테스트
export API_URL=https://staging-api.pawfiler.com
./run.sh quiz staging

# Production 환경 테스트
export API_URL=https://api.pawfiler.com
./run.sh quiz production
```

### 3. 결과 확인

```bash
# 최신 리포트 확인
cat reports/quiz-local-*.md

# 결과 비교
ls -lh results/baseline/
ls -lh results/production/
```

## 📊 SLO 기준

### Quiz Service
- P50 < 150ms
- P95 < 250ms
- P99 < 350ms
- Error Rate < 1%

### Community Service
- P50 < 150ms
- P95 < 300ms
- P99 < 500ms
- Error Rate < 1%

### Video/Audio Analysis
- Throughput: 최소 10 requests/minute
- P95 < 30초
- P99 < 60초

## 🔄 CI/CD 통합

```yaml
# .github/workflows/performance-test.yml
name: Performance Test

on:
  schedule:
    - cron: '0 2 * * *'  # 매일 새벽 2시
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install k6
        run: |
          sudo apt-get update
          sudo apt-get install k6
      - name: Run load test
        run: |
          cd scripts/load-test
          ./run.sh quiz production
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: scripts/load-test/reports/
```

## 📝 시나리오 추가

새로운 서비스 테스트를 추가하려면:

1. `scenarios/` 디렉토리에 새 `.js` 파일 생성
2. k6 스크립트 작성
3. `./run.sh <service-name>` 실행

예시:
```javascript
// scenarios/new-service.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],
  },
};

export default function () {
  const res = http.get(`${__ENV.API_URL}/api/endpoint`);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```
