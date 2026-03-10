import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(50)<150', 'p(95)<250', 'p(99)<350'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:8080';

export default function () {
  // Test GET /api/questions
  let res = http.get(`${API_URL}/api/questions`);
  
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 150ms': (r) => r.timings.duration < 150,
    'has questions': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) && body.length > 0;
      } catch (e) {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  
  sleep(1);
  
  // Test GET /api/questions/:id
  res = http.get(`${API_URL}/api/questions/1`);
  
  check(res, {
    'question detail status is 200': (r) => r.status === 200,
    'question detail response time < 150ms': (r) => r.timings.duration < 150,
  });
  
  sleep(1);
}
