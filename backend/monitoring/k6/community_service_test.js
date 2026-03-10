/**
 * Community Service 부하 테스트
 * 
 * 실행: k6 run community_service_test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency');
const postLatency = new Trend('post_latency');
const commentLatency = new Trend('comment_latency');
const likeLatency = new Trend('like_latency');

// 테스트 설정
export const options = {
  scenarios: {
    community_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '2m', target: 80 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<2000'],
    'http_req_duration{endpoint:feed}': ['p(95)<1000'],
    'http_req_duration{endpoint:post}': ['p(95)<1500'],
    'http_req_duration{endpoint:comment}': ['p(95)<1000'],
    'http_req_duration{endpoint:like}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USER_IDS = Array.from({ length: 50 }, (_, i) => `test-user-${i}`);

// 생성된 포스트 ID 저장
let createdPostIds = [];

export default function () {
  const userId = USER_IDS[Math.floor(Math.random() * USER_IDS.length)];
  
  // 1. 피드 조회 (50%)
  if (Math.random() < 0.5) {
    testGetFeed();
  }
  
  // 2. 포스트 조회 (20%)
  if (Math.random() < 0.2 && createdPostIds.length > 0) {
    testGetPost();
  }
  
  // 3. 포스트 생성 (10%)
  if (Math.random() < 0.1) {
    testCreatePost(userId);
  }
  
  // 4. 댓글 작성 (10%)
  if (Math.random() < 0.1 && createdPostIds.length > 0) {
    testCreateComment(userId);
  }
  
  // 5. 좋아요 (10%)
  if (Math.random() < 0.1 && createdPostIds.length > 0) {
    testLikePost(userId);
  }
  
  sleep(1);
}

function testGetFeed() {
  const page = Math.floor(Math.random() * 5) + 1;
  const params = {
    tags: { endpoint: 'feed' },
  };
  
  const response = http.get(
    `${BASE_URL}/api/community/feed?page=${page}&pageSize=15`,
    params
  );
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has posts': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.posts);
      } catch (e) {
        return false;
      }
    },
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  feedLatency.add(response.timings.duration);
  errorRate.add(!success);
}

function testGetPost() {
  const postId = createdPostIds[Math.floor(Math.random() * createdPostIds.length)];
  const params = {
    tags: { endpoint: 'post' },
  };
  
  const response = http.get(
    `${BASE_URL}/api/community/post?postId=${postId}`,
    params
  );
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has post data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id !== undefined;
      } catch (e) {
        return false;
      }
    },
  });
  
  postLatency.add(response.timings.duration);
  errorRate.add(!success);
}

function testCreatePost(userId) {
  const payload = JSON.stringify({
    userId: userId,
    title: `Load Test Post ${Date.now()}`,
    content: `This is a load test post created at ${new Date().toISOString()}`,
    category: ['discussion', 'question', 'showcase'][Math.floor(Math.random() * 3)],
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'create_post' },
  };
  
  const response = http.post(`${BASE_URL}/api/community/post`, payload, params);
  
  const success = check(response, {
    'status is 201': (r) => r.status === 201,
    'has post id': (r) => {
      try {
        const body = JSON.parse(r.body);
        if (body.id) {
          createdPostIds.push(body.id);
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    },
  });
  
  postLatency.add(response.timings.duration);
  errorRate.add(!success);
}

function testCreateComment(userId) {
  const postId = createdPostIds[Math.floor(Math.random() * createdPostIds.length)];
  
  const payload = JSON.stringify({
    postId: postId,
    userId: userId,
    content: `Load test comment ${Date.now()}`,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'comment' },
  };
  
  const response = http.post(`${BASE_URL}/api/community/comment`, payload, params);
  
  const success = check(response, {
    'status is 201': (r) => r.status === 201,
  });
  
  commentLatency.add(response.timings.duration);
  errorRate.add(!success);
}

function testLikePost(userId) {
  const postId = createdPostIds[Math.floor(Math.random() * createdPostIds.length)];
  
  const payload = JSON.stringify({
    postId: postId,
    userId: userId,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'like' },
  };
  
  const response = http.post(`${BASE_URL}/api/community/like`, payload, params);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  likeLatency.add(response.timings.duration);
  errorRate.add(!success);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'community_service_summary.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  let summary = '\n';
  summary += '='.repeat(60) + '\n';
  summary += 'Community Service Load Test Summary\n';
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
