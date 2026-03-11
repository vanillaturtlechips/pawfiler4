import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(50)<150', 'p(95)<300', 'p(99)<500'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:8080';

export default function () {
  // Test GET /api/posts
  let res = http.get(`${API_URL}/api/posts`);
  
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 150ms': (r) => r.timings.duration < 150,
  });
  
  errorRate.add(!success);
  
  sleep(1);
}
