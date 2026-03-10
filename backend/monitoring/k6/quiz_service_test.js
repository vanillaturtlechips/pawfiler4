/**
 * Quiz Service 부하 테스트
 * 
 * 실행: k6 run quiz_service_test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const quizLatency = new Trend('quiz_latency');
const submitLatency = new Trend('submit_latency');
const statsLatency = new Trend('stats_latency');
const requestCounter = new Counter('requests_total');

// 테스트 설정
export const options = {
  scenarios: {
    // 일반 부하 테스트
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },   // 워밍업
        { duration: '3m', target: 50 },   // 정상 부하
        { duration: '2m', target: 100 },  // 피크 부하
        { duration: '2m', target: 50 },   // 안정화
        { duration: '1m', target: 0 },    // 종료
      ],
      gracefulRampDown: '30s',
    },
  },
  
  // SLO 임계값
  thresholds: {
    'http_req_failed': ['rate<0.01'],           // 에러율 < 1%
    'http_req_duration': ['p(95)<2000'],        // P95 < 2초
    'http_req_duration{endpoint:random}': ['p(95)<1500'],  // 퀴즈 조회 P95 < 1.5초
    'http_req_duration{endpoint:submit}': ['p(95)<2000'],  // 제출 P95 < 2초
    'http_req_duration{endpoint:stats}': ['p(95)<500'],    // 통계 P95 < 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 테스트 사용자 풀
const USER_IDS = Array.from({ length: 100 }, (_, i) => `test-user-${i}`);

// 퀴즈 타입
const QUESTION_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'REGION_SELECT', 'COMPARISON'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function () {
  const userId = USER_IDS[Math.floor(Math.random() * USER_IDS.length)];
  
  // 1. 랜덤 퀴즈 가져오기 (70%)
  if (Math.random() < 0.7) {
    testGetRandomQuestion(userId);
  }
  
  // 2. 답안 제출 (20%)
  if (Math.random() < 0.2) {
    testSubmitAnswer(userId);
  }
  
  // 3. 사용자 통계 조회 (10%)
  if (Math.random() < 0.1) {
    testGetUserStats(userId);
  }
  
  sleep(1);
}

function testGetRandomQuestion(userId) {
  const difficulty = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  const type = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
  
  const payload = JSON.stringify({
    user_id: userId,
    difficulty: difficulty,
    type: type,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'random' },
  };
  
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/api/quiz/random`, payload, params);
  const duration = Date.now() - startTime;
  
  requestCounter.add(1);
  quizLatency.add(duration);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has question id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id !== undefined;
      } catch (e) {
        return false;
      }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  if (!success) {
    errorRate.add(1);
    console.error(`GetRandomQuestion failed: ${response.status} ${response.body}`);
  } else {
    errorRate.add(0);
  }
  
  return response;
}

function testSubmitAnswer(userId) {
  // 먼저 퀴즈를 가져옴
  const quizResponse = testGetRandomQuestion(userId);
  
  if (quizResponse.status !== 200) {
    return;
  }
  
  let quiz;
  try {
    quiz = JSON.parse(quizResponse.body);
  } catch (e) {
    console.error('Failed to parse quiz response');
    return;
  }
  
  // 퀴즈 타입에 따라 답안 생성
  let payload = {
    user_id: userId,
    question_id: quiz.id,
  };
  
  switch (quiz.type) {
    case 'MULTIPLE_CHOICE':
      payload.selected_index = Math.floor(Math.random() * (quiz.options?.length || 4));
      break;
    case 'TRUE_FALSE':
      payload.selected_answer = Math.random() < 0.5;
      break;
    case 'REGION_SELECT':
      payload.selected_region = {
        x: Math.floor(Math.random() * 1920),
        y: Math.floor(Math.random() * 1080),
      };
      break;
    case 'COMPARISON':
      payload.selected_side = Math.random() < 0.5 ? 'left' : 'right';
      break;
  }
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'submit' },
  };
  
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/api/quiz/submit`, JSON.stringify(payload), params);
  const duration = Date.now() - startTime;
  
  requestCounter.add(1);
  submitLatency.add(duration);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has correct field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.correct !== undefined;
      } catch (e) {
        return false;
      }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  if (!success) {
    errorRate.add(1);
    console.error(`SubmitAnswer failed: ${response.status} ${response.body}`);
  } else {
    errorRate.add(0);
  }
}

function testGetUserStats(userId) {
  const payload = JSON.stringify({
    user_id: userId,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'stats' },
  };
  
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/api/quiz/stats`, payload, params);
  const duration = Date.now() - startTime;
  
  requestCounter.add(1);
  statsLatency.add(duration);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has stats': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.total_answered !== undefined;
      } catch (e) {
        return false;
      }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  if (!success) {
    errorRate.add(1);
    console.error(`GetUserStats failed: ${response.status} ${response.body}`);
  } else {
    errorRate.add(0);
  }
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'quiz_service_summary.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  let summary = '\n';
  summary += '='.repeat(60) + '\n';
  summary += 'Quiz Service Load Test Summary\n';
  summary += '='.repeat(60) + '\n';
  
  const requests = data.metrics.http_reqs;
  summary += `Total Requests: ${requests.values.count}\n`;
  summary += `Request Rate: ${requests.values.rate.toFixed(2)} req/s\n`;
  
  const duration = data.metrics.http_req_duration;
  summary += `\nResponse Time:\n`;
  summary += `  P50: ${duration.values['p(50)'].toFixed(2)}ms\n`;
  summary += `  P95: ${duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `  P99: ${duration.values['p(99)'].toFixed(2)}ms\n`;
  
  const failed = data.metrics.http_req_failed;
  summary += `\nError Rate: ${(failed.values.rate * 100).toFixed(2)}%\n`;
  
  summary += `\nSLO Status:\n`;
  summary += `  Error Rate (<1%): ${failed.values.rate < 0.01 ? '✓ PASS' : '✗ FAIL'}\n`;
  summary += `  P95 Latency (<2s): ${duration.values['p(95)'] < 2000 ? '✓ PASS' : '✗ FAIL'}\n`;
  
  summary += '='.repeat(60) + '\n';
  
  return summary;
}
