import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const quizResponseTime = new Trend('quiz_response_time');
const communityResponseTime = new Trend('community_response_time');
const quizRequests = new Counter('quiz_requests');
const communityRequests = new Counter('community_requests');
const totalTransactions = new Counter('total_transactions');

// 15분 동안 150명에서 시작해서 5초당 10명씩 증가
// 15분 = 900초, 5초당 10명 = 180회 증가 = 1800명 증가
// 최종: 150 + 1800 = 1950명
export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 150,  // 초기 150명
      stages: [
        { duration: '15m', target: 1950 },  // 15분 동안 1950명까지 선형 증가
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(50)<1000', 'p(95)<2000', 'p(99)<5000'],
    'http_req_failed': ['rate<0.8'],  // 80% 실패율까지 허용 (다운 시점 확인)
    'errors': ['rate<0.8'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:8080';

function generateUserId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function () {
  const userId = generateUserId();
  const isQuizService = Math.random() < 0.5;  // 50% Quiz, 50% Community
  
  if (isQuizService) {
    // Quiz Service - POST 요청
    const res = http.post(
      `${API_URL}/api/quiz.QuizService/GetRandomQuestion`,
      JSON.stringify({ user_id: userId }),
      {
        headers: { 
          'Content-Type': 'application/json',
        },
        tags: { service: 'quiz', method: 'POST' },
      }
    );
    
    quizResponseTime.add(res.timings.duration);
    quizRequests.add(1);
    totalTransactions.add(1);
    
    const success = check(res, {
      'Quiz POST status is 200': (r) => r.status === 200,
      'Quiz POST response time < 2000ms': (r) => r.timings.duration < 2000,
    });
    
    errorRate.add(!success);
    
  } else {
    // Community Service - 10% POST, 90% GET
    const isPost = Math.random() < 0.1;
    
    if (isPost) {
      // POST - 게시글 작성
      const res = http.post(
        `${API_URL}/api/community.CommunityService/CreatePost`,
        JSON.stringify({
          user_id: userId,
          title: `Load Test Post ${Date.now()}`,
          body: `This is a test post created during stress testing at ${new Date().toISOString()}`,
          author_nickname: `Tester${Math.floor(Math.random() * 1000)}`,
          author_emoji: '🤖',
          tags: ['테스트', '부하테스트'],
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
          },
          tags: { service: 'community', method: 'POST' },
        }
      );
      
      communityResponseTime.add(res.timings.duration);
      communityRequests.add(1);
      totalTransactions.add(1);
      
      const success = check(res, {
        'Community POST status is 200': (r) => r.status === 200,
        'Community POST response time < 2000ms': (r) => r.timings.duration < 2000,
      });
      
      errorRate.add(!success);
      
    } else {
      // POST - 피드 조회 (gRPC-JSON transcoding)
      const res = http.post(
        `${API_URL}/api/community.CommunityService/GetFeed`,
        JSON.stringify({ page: 1, page_size: 15 }),
        {
          headers: { 
            'Content-Type': 'application/json',
          },
          tags: { service: 'community', method: 'POST' },
        }
      );
      
      communityResponseTime.add(res.timings.duration);
      communityRequests.add(1);
      totalTransactions.add(1);
      
      const success = check(res, {
        'Community GET status is 200': (r) => r.status === 200,
        'Community GET response time < 2000ms': (r) => r.timings.duration < 2000,
      });
      
      errorRate.add(!success);
    }
  }
  
  sleep(0.2);  // 0.2초 대기 = 초당 5개 요청
}

export function setup() {
  console.log('=== Stress Test 시작 ===');
  console.log(`API URL: ${API_URL}`);
  console.log('초기: 150명 (VUs)');
  console.log('증가율: 5초당 10명');
  console.log('기간: 15분');
  console.log('최종: 1950명 (VUs)');
  console.log('각 사용자: 초당 5개 요청');
  console.log('예상 RPS: 750 → 9,750');
  console.log('Quiz:Community = 50:50');
  console.log('Community 읽기:쓰기 = 90:10');
  console.log('========================');
  
  return { startTime: Date.now() };
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // 1분마다 중간 결과 저장을 위한 커스텀 요약
  const summary = {
    timestamp: timestamp,
    duration_seconds: data.state.testRunDurationMs / 1000,
    metrics: {
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      total_transactions: data.metrics.total_transactions?.values?.count || 0,
      quiz_requests: data.metrics.quiz_requests?.values?.count || 0,
      community_requests: data.metrics.community_requests?.values?.count || 0,
      error_rate: data.metrics.errors?.values?.rate || 0,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
      response_time: {
        avg: data.metrics.http_req_duration?.values?.avg || 0,
        p50: data.metrics.http_req_duration?.values?.med || 0,
        p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.http_req_duration?.values?.['p(99)'] || 0,
        max: data.metrics.http_req_duration?.values?.max || 0,
      },
      quiz_response_time: {
        avg: data.metrics.quiz_response_time?.values?.avg || 0,
        p95: data.metrics.quiz_response_time?.values?.['p(95)'] || 0,
      },
      community_response_time: {
        avg: data.metrics.community_response_time?.values?.avg || 0,
        p95: data.metrics.community_response_time?.values?.['p(95)'] || 0,
      },
      vus: data.metrics.vus?.values?.value || 0,
      vus_max: data.metrics.vus_max?.values?.value || 0,
    },
  };
  
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    [`results/stress-test-${timestamp}.json`]: JSON.stringify(summary, null, 2),
    [`results/stress-test-${timestamp}-full.json`]: JSON.stringify(data, null, 2),
  };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('');
  console.log('=== Stress Test 완료 ===');
  console.log(`실행 시간: ${duration.toFixed(0)}초`);
  console.log('결과 파일이 results/ 폴더에 저장되었습니다');
  console.log('========================');
}
