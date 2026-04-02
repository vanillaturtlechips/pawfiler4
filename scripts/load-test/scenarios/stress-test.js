/**
 * ============================================================
 * ⚠️  부하 테스트 실행 전 필수 체크리스트
 * ============================================================
 *
 * 1. auth-service rate limit 비활성화 (필수)
 *    k6는 단일 IP에서 요청을 보내므로 분당 300회 rate limit에 걸립니다.
 *    테스트 전 auth-service deployment에 아래 환경변수를 추가하세요:
 *
 *      kubectl set env deployment/auth-service \
 *        RATE_LIMIT_ENABLED=false -n pawfiler
 *
 *    테스트 완료 후 반드시 원복:
 *      kubectl set env deployment/auth-service \
 *        RATE_LIMIT_ENABLED=true -n pawfiler
 *
 * 2. 테스트 완료 후 데이터 정리 (teardown 로그 참고)
 *    - quiz.user_answers: 최근 1시간 데이터 삭제
 *    - community.posts: LOAD_TEST 태그 게시글 삭제
 *
 * 3. 테스트 대상 URL 확인
 *    기본값: https://pawfiler.site
 *    변경 시: k6 run -e API_URL=https://... stress-test.js
 * ============================================================
 */

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

// 1000 VUs 고정, 10분 테스트
export const options = {
  scenarios: {
    stress_test: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '10m',
    },
  },
  thresholds: {
    'http_req_duration': ['p(50)<500', 'p(95)<1000', 'p(99)<3000'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.02'],
  },
};

const API_URL = __ENV.API_URL || 'https://pawfiler.site';

// 1x1 JPEG (최소 크기, base64 인코딩)
const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFBABAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEQMRAD8AJQD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AF//2Q==';

// Quiz 서비스용: 순수 UUID (DB 타입: uuid)
function generateQuizUserId() {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return uuid; // 순수 UUID: "550e8400-e29b-41d4-a716-446655440003"
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
      
      // 200=정상, 429=에너지 부족 (정상 동작). 그 외만 에러
      const getQuestionOk = getQuestionRes.status === 200 || getQuestionRes.status === 429;
      check(getQuestionRes, {
        'Quiz GetRandomQuestion status is 200 or 429': (r) => r.status === 200 || r.status === 429,
        'Quiz GetRandomQuestion response time < 2000ms': (r) => r.timings.duration < 2000,
      });
      errorRate.add(!getQuestionOk);

      // 429 에너지 부족이면 더 이상 문제 풀기 불가 → 루프 종료
      if (getQuestionRes.status === 429) {
        break;
      }

      // 2. 답변 제출 (문제를 성공적으로 가져온 경우에만)
      if (getQuestionOk && getQuestionRes.body) {
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

          // 429=에너지 부족도 정상 동작
          const submitOk = submitAnswerRes.status === 200 || submitAnswerRes.status === 429;
          check(submitAnswerRes, {
            'Quiz SubmitAnswer status is 200 or 429': (r) => r.status === 200 || r.status === 429,
            'Quiz SubmitAnswer response time < 2000ms': (r) => r.timings.duration < 2000,
          });
          errorRate.add(!submitOk);

          if (submitAnswerRes.status === 429) {
            break;
          }
        } catch (e) {
          // JSON 파싱 실패는 서버 에러가 아님 (에너지 부족 등 비정상 응답 형식)
        }
      }
      
      // 문제 사이 짧은 대기 (사용자가 문제 읽고 답하는 시간)
      sleep(1.25);
    }
    // Quiz는 이미 충분히 시간 소비했으므로 추가 sleep 불필요
    
  } else {
    // Community Service - 조회 90% / 작성 10%
    const isWrite = Math.random() < 0.1;

    if (isWrite) {
      // CreatePost — 1x1 JPEG를 file_content로 전송 (S3 업로드 포함)
      const res = http.post(
        `${API_URL}/api/community.CommunityService/CreatePost`,
        JSON.stringify({
          title: `Load Test ${Date.now()}`,
          body: `Stress test post at ${new Date().toISOString()}`,
          tags: ['LOAD_TEST'],
          file_content: TINY_JPEG_B64,
          file_name: `test-${Date.now()}.jpg`,
          file_content_type: 'image/jpeg',
          is_correct: Math.random() < 0.5,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          tags: { service: 'community', method: 'CreatePost' },
        }
      );

      communityResponseTime.add(res.timings.duration);
      communityRequests.add(1);
      totalTransactions.add(1);

      const success = check(res, {
        'Community CreatePost status is 200': (r) => r.status === 200,
        'Community CreatePost response time < 3000ms': (r) => r.timings.duration < 3000,
      });
      errorRate.add(!success);

    } else {
      // GetFeed — 피드 조회
      const page = Math.random() < 0.8 ? 1 : Math.floor(Math.random() * 5) + 1;
      const res = http.post(
        `${API_URL}/api/community.CommunityService/GetFeed`,
        JSON.stringify({ page: page, page_size: 15 }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          tags: { service: 'community', method: 'GetFeed' },
        }
      );

      communityResponseTime.add(res.timings.duration);
      communityRequests.add(1);
      totalTransactions.add(1);

      const success = check(res, {
        'Community GetFeed status is 200': (r) => r.status === 200,
        'Community GetFeed response time < 2000ms': (r) => r.timings.duration < 2000,
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
  console.log('VUs: 600 (고정)');
  console.log('기간: 5분');
  console.log('Quiz:Community = 50:50');
  console.log('Community: GetFeed 90% / CreatePost 10%');
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
  console.log('Community 테스트 게시글 삭제:');
  console.log(`DELETE FROM community.posts WHERE tags && ARRAY['LOAD_TEST'];`);
  console.log('========================');
}
