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

// 10분 동안 150명에서 시작해서 5초당 7명씩 증가
// 10분 = 600초, 5초당 7명 = 120회 증가 = 840명 증가
// 최종: 150 + 840 = 990명 (약 1000명)
export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 225,  // 초기 225명 (150 * 1.5)
      stages: [
        { duration: '10m', target: 2000 },  // 10분 동안 2000명까지 선형 증가
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

const API_URL = __ENV.API_URL || 'https://pawfiler.site';

// Quiz 서비스용: 순수 UUID (DB 타입: uuid)
function generateQuizUserId() {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return uuid; // 순수 UUID: "550e8400-e29b-41d4-a716-446655440003"
}

// Community 서비스용: 접두사 있는 문자열 (DB 타입: varchar)
function generateCommunityUserId() {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return 'test-load-' + uuid; // 접두사 포함: "test-load-550e8400-..."
}

// 각 문제 유형별 랜덤 답변 생성
function generateAnswer(questionType) {
  switch (questionType) {
    case 'multiple_choice':
      return {
        selected_index: Math.floor(Math.random() * 4), // 0-3
      };
    case 'true_false':
      return {
        selected_answer: Math.random() < 0.5,
      };
    case 'region_select':
      return {
        selected_region: {
          x: Math.floor(Math.random() * 800), // 0-800
          y: Math.floor(Math.random() * 600), // 0-600
        },
      };
    case 'comparison':
      return {
        selected_side: Math.random() < 0.5 ? 'left' : 'right',
      };
    default:
      return {
        selected_index: 0,
      };
  }
}

export default function () {
  const quizUserId = generateQuizUserId();      // Quiz용: 순수 UUID
  const communityUserId = generateCommunityUserId(); // Community용: test-load- 접두사
  const isQuizService = Math.random() < 0.5;  // 50% Quiz, 50% Community
  
  if (isQuizService) {
    // Quiz Service - 10문제 풀기 (실제 사용자 플로우)
    for (let i = 0; i < 10; i++) {
      // 1. 문제 가져오기
      const getQuestionRes = http.post(
        `${API_URL}/api/quiz.QuizService/GetRandomQuestion`,
        JSON.stringify({ user_id: quizUserId }),
        {
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'k6-load-test',
            'Accept': 'application/json',
          },
          tags: { service: 'quiz', method: 'GetRandomQuestion' },
        }
      );
      
      quizResponseTime.add(getQuestionRes.timings.duration);
      quizRequests.add(1);
      totalTransactions.add(1);
      
      const getQuestionSuccess = check(getQuestionRes, {
        'Quiz GetRandomQuestion status is 200': (r) => r.status === 200,
        'Quiz GetRandomQuestion response time < 2000ms': (r) => r.timings.duration < 2000,
      });
      
      errorRate.add(!getQuestionSuccess);
      
      // 2. 답변 제출 (문제를 성공적으로 가져온 경우에만)
      if (getQuestionSuccess && getQuestionRes.body) {
        try {
          const question = JSON.parse(getQuestionRes.body);
          const answer = generateAnswer(question.type);
          
          const submitAnswerRes = http.post(
            `${API_URL}/api/quiz.QuizService/SubmitAnswer`,
            JSON.stringify({
              user_id: quizUserId,  // Quiz용 순수 UUID 사용
              question_id: question.id,
              ...answer,
            }),
            {
              headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'k6-load-test',
                'Accept': 'application/json',
              },
              tags: { service: 'quiz', method: 'SubmitAnswer' },
            }
          );
          
          quizResponseTime.add(submitAnswerRes.timings.duration);
          quizRequests.add(1);
          totalTransactions.add(1);
          
          const submitSuccess = check(submitAnswerRes, {
            'Quiz SubmitAnswer status is 200': (r) => r.status === 200,
            'Quiz SubmitAnswer response time < 2000ms': (r) => r.timings.duration < 2000,
          });
          
          errorRate.add(!submitSuccess);
        } catch (e) {
          // JSON 파싱 실패 시 에러로 기록
          errorRate.add(true);
        }
      }
      
      // 문제 사이 짧은 대기 (사용자가 문제 읽고 답하는 시간)
      sleep(1.25);
    }
    // Quiz는 이미 충분히 시간 소비했으므로 추가 sleep 불필요
    
  } else {
    // Community Service - 10% POST, 90% GET
    const isPost = Math.random() < 0.1;
    
    if (isPost) {
      // POST - 게시글 작성
      const res = http.post(
        `${API_URL}/api/community.CommunityService/CreatePost`,
        JSON.stringify({
          user_id: communityUserId,  // Community용 test-load- 접두사 사용
          title: `Load Test Post ${Date.now()}`,
          body: `This is a test post created during stress testing at ${new Date().toISOString()}`,
          author_nickname: `Tester${Math.floor(Math.random() * 1000)}`,
          author_emoji: '🤖',
          tags: ['LOAD_TEST', 'DELETE_ME', '부하테스트'],
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'k6-load-test',
            'Accept': 'application/json',
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
    
    // Community는 빠르게 요청하므로 짧은 대기
    sleep(0.2);
  }
}

export function setup() {
  console.log('=== Stress Test 시작 ===');
  console.log(`API URL: ${API_URL}`);
  console.log('초기: 225명 (VUs)');
  console.log('증가율: 5초당 약 10명');
  console.log('기간: 10분');
  console.log('최종: 2000명 (VUs)');
  console.log('각 사용자: 초당 약 1.6개 요청');
  console.log('예상 RPS: 360 → 3,200');
  console.log('Quiz:Community = 50:50');
  console.log('Community 읽기:쓰기 = 90:10');
  console.log('Quiz: 순수 UUID, Community: test-load- 접두사');
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
  console.log('');
  console.log('테스트 데이터 정리 방법:');
  console.log('Quiz 답변 삭제 (최근 1시간):');
  console.log(`DELETE FROM quiz.user_answers WHERE answered_at >= NOW() - INTERVAL '1 hour';`);
  console.log('Community 게시글 삭제 (태그 기반):');
  console.log(`DELETE FROM community.posts WHERE tags && ARRAY['LOAD_TEST', 'DELETE_ME', '부하테스트'];`);
  console.log('========================');
}
