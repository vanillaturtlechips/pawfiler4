// PawFiler AWS 프로덕션 환경 부하 테스트 스크립트 (k6)

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// AWS CloudFront 또는 ALB 엔드포인트
const BASE_URL = __ENV.BASE_URL || 'https://YOUR_CLOUDFRONT_DOMAIN';
const TEST_SCENARIO = __ENV.TEST_SCENARIO || 'normal';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// SLO 정의
const SLO = {
  availability: 0.9995,  // 99.95%
  p50: 200,              // 200ms
  p95: 500,              // 500ms
  p99: 1000,             // 1000ms
  errorRate: 0,          // 0%
};

// 시나리오별 설정
const SCENARIOS = {
  normal: {
    // Quiz Service: 500명 (점진적 램핑)
    quiz_normal: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },    // 1분에 100명
        { duration: '1m', target: 200 },    // 2분에 200명
        { duration: '1m', target: 300 },    // 3분에 300명
        { duration: '1m', target: 400 },    // 4분에 400명
        { duration: '1m', target: 500 },    // 5분에 500명
        { duration: '5m', target: 500 },    // 5분간 유지
      ],
      exec: 'quizLoadTest',
      tags: { scenario: 'normal', service: 'quiz' },
    },
    // Community Service: 500명 (점진적 램핑)
    community_normal: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },    // 1분에 100명
        { duration: '1m', target: 200 },    // 2분에 200명
        { duration: '1m', target: 300 },    // 3분에 300명
        { duration: '1m', target: 400 },    // 4분에 400명
        { duration: '1m', target: 500 },    // 5분에 500명
        { duration: '5m', target: 500 },    // 5분간 유지
      ],
      exec: 'communityLoadTest',
      tags: { scenario: 'normal', service: 'community' },
    },
  },
  peak: {
    // Quiz Service: 2500명
    quiz_peak: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '2m', target: 1500 },
        { duration: '3m', target: 2500 },
        { duration: '10m', target: 2500 },
        { duration: '2m', target: 500 },
      ],
      exec: 'quizLoadTest',
      tags: { scenario: 'peak', service: 'quiz' },
    },
    // Community Service: 2500명
    community_peak: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '2m', target: 1500 },
        { duration: '3m', target: 2500 },
        { duration: '10m', target: 2500 },
        { duration: '2m', target: 500 },
      ],
      exec: 'communityLoadTest',
      tags: { scenario: 'peak', service: 'community' },
    },
  },
  stress: {
    // Quiz Service: 3500명
    quiz_stress: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '5m', target: 1500 },
        { duration: '5m', target: 2500 },
        { duration: '5m', target: 3500 },
        { duration: '10m', target: 3500 },
        { duration: '5m', target: 500 },
      ],
      exec: 'quizLoadTest',
      tags: { scenario: 'stress', service: 'quiz' },
    },
    // Community Service: 3500명
    community_stress: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '5m', target: 1500 },
        { duration: '5m', target: 2500 },
        { duration: '5m', target: 3500 },
        { duration: '10m', target: 3500 },
        { duration: '5m', target: 500 },
      ],
      exec: 'communityLoadTest',
      tags: { scenario: 'stress', service: 'community' },
    },
  },
  spike: {
    // Quiz Service: 2500명
    quiz_spike: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '1m', target: 500 },
        { duration: '1m', target: 2500 },
        { duration: '5m', target: 2500 },
        { duration: '1m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '1m', target: 2500 },
        { duration: '1m', target: 500 },
      ],
      exec: 'quizLoadTest',
      tags: { scenario: 'spike', service: 'quiz' },
    },
    // Community Service: 2500명
    community_spike: {
      executor: 'ramping-vus',
      startVUs: 500,
      stages: [
        { duration: '1m', target: 500 },
        { duration: '1m', target: 2500 },
        { duration: '5m', target: 2500 },
        { duration: '1m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '1m', target: 2500 },
        { duration: '1m', target: 500 },
      ],
      exec: 'communityLoadTest',
      tags: { scenario: 'spike', service: 'community' },
    },
  },
};

// 선택된 시나리오만 실행
const selectedScenario = TEST_SCENARIO || 'normal';
const scenarios = {};

if (selectedScenario === 'all') {
  // 전체 테스트: 모든 시나리오를 순차적으로 실행
  Object.keys(SCENARIOS).forEach(scenarioName => {
    Object.assign(scenarios, SCENARIOS[scenarioName]);
  });
} else {
  // 단일 시나리오 실행 (Quiz + Community 동시)
  Object.assign(scenarios, SCENARIOS[selectedScenario]);
}

// 테스트 시나리오 설정
export const options = {
  scenarios,
  
  // 연결 재사용 비활성화 (실제 부하 테스트)
  noConnectionReuse: true,
  noVUConnectionReuse: true,
  
  // SLO 임계값 설정
  thresholds: {
    'http_req_duration': [
      `p(50)<${SLO.p50}`,    // P50 < 200ms
      `p(95)<${SLO.p95}`,    // P95 < 500ms
      `p(99)<${SLO.p99}`,    // P99 < 1000ms
    ],
    'http_req_failed': [`rate<=${SLO.errorRate}`],  // 오류율 0%
    'errors': [`rate<=${SLO.errorRate}`],
  },
};

// 사용자 ID 생성 (UUID v4 형식)
function generateUserId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Quiz Service 테스트
function testQuizService() {
  const userId = generateUserId();
  
  group('Quiz Service', () => {
    // 1. 랜덤 문제 가져오기
    const getQuestionRes = http.post(
      `${BASE_URL}/api/quiz.QuizService/GetRandomQuestion`,
      JSON.stringify({ user_id: userId }),
      {
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'close'  // 연결 재사용 방지
        },
        tags: { name: 'GetRandomQuestion' },
      }
    );
    
    const questionSuccess = check(getQuestionRes, {
      'GetRandomQuestion status 200': (r) => r.status === 200,
      'GetRandomQuestion < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(!questionSuccess);
    responseTime.add(getQuestionRes.timings.duration);
    requestCount.add(1);
    
    if (questionSuccess && getQuestionRes.body) {
      const question = JSON.parse(getQuestionRes.body);
      
      // 2. 답변 제출
      const submitRes = http.post(
        `${BASE_URL}/api/quiz.QuizService/SubmitAnswer`,
        JSON.stringify({
          user_id: userId,
          question_id: question.id,
          selected_index: Math.floor(Math.random() * 4),
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
            'Connection': 'close'  // 연결 재사용 방지
          },
          tags: { name: 'SubmitAnswer' },
        }
      );
      
      const submitSuccess = check(submitRes, {
        'SubmitAnswer status 200': (r) => r.status === 200,
        'SubmitAnswer < 500ms': (r) => r.timings.duration < 500,
      });
      
      errorRate.add(!submitSuccess);
      responseTime.add(submitRes.timings.duration);
      requestCount.add(1);
    }
    
    // 3. 사용자 통계 조회
    const statsRes = http.post(
      `${BASE_URL}/api/quiz.QuizService/GetUserStats`,
      JSON.stringify({ user_id: userId }),
      {
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'close'  // 연결 재사용 방지
        },
        tags: { name: 'GetUserStats' },
      }
    );
    
    const statsSuccess = check(statsRes, {
      'GetUserStats status 200': (r) => r.status === 200,
      'GetUserStats < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(!statsSuccess);
    responseTime.add(statsRes.timings.duration);
    requestCount.add(1);
  });
}

// Community Service 테스트
function testCommunityService() {
  group('Community Service', () => {
    // 1. 피드 조회
    const feedRes = http.post(
      `${BASE_URL}/api/community.CommunityService/GetFeed`,
      JSON.stringify({ page: 1, page_size: 15 }),
      {
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'close'  // 연결 재사용 방지
        },
        tags: { name: 'GetFeed' },
      }
    );
    
    const feedSuccess = check(feedRes, {
      'GetFeed status 200': (r) => r.status === 200,
      'GetFeed < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(!feedSuccess);
    responseTime.add(feedRes.timings.duration);
    requestCount.add(1);
    
    // 2. 게시글 조회 (랜덤)
    if (feedSuccess && feedRes.body) {
      const feed = JSON.parse(feedRes.body);
      if (feed.posts && feed.posts.length > 0) {
        const randomPost = feed.posts[Math.floor(Math.random() * feed.posts.length)];
        
        const postRes = http.post(
          `${BASE_URL}/api/community.CommunityService/GetPost`,
          JSON.stringify({ post_id: randomPost.id }),
          {
            headers: { 
              'Content-Type': 'application/json',
              'Connection': 'close'  // 연결 재사용 방지
            },
            tags: { name: 'GetPost' },
          }
        );
        
        const postSuccess = check(postRes, {
          'GetPost status 200': (r) => r.status === 200,
          'GetPost < 500ms': (r) => r.timings.duration < 500,
        });
        
        errorRate.add(!postSuccess);
        responseTime.add(postRes.timings.duration);
        requestCount.add(1);
      }
    }
  });
}

// Quiz Service 전용 부하 테스트
export function quizLoadTest() {
  testQuizService();
  sleep(1);
}

// Community Service 전용 부하 테스트
export function communityLoadTest() {
  testCommunityService();
  sleep(1);
}

// 테스트 시작 전 설정
export function setup() {
  console.log('=== PawFiler AWS 부하 테스트 시작 ===');
  console.log(`엔드포인트: ${BASE_URL}`);
  console.log(`시나리오: ${TEST_SCENARIO}`);
  console.log('');
  console.log('SLO 목표:');
  console.log(`  - 가용성: ${SLO.availability * 100}%`);
  console.log(`  - P50: ${SLO.p50}ms`);
  console.log(`  - P95: ${SLO.p95}ms`);
  console.log(`  - P99: ${SLO.p99}ms`);
  console.log(`  - 오류율: ${SLO.errorRate}%`);
  console.log('=====================================');
}

// 테스트 종료 후 정리
export function teardown() {
  console.log('');
  console.log('=== 부하 테스트 완료 ===');
  console.log('AWS 리소스 모니터링:');
  console.log('  - kubectl top pods -n pawfiler');
  console.log('  - kubectl port-forward -n monitoring svc/grafana 3000:80');
  console.log('========================');
}
