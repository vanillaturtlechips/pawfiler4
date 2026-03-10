/**
 * PawFiler Video Analysis Service - K6 부하 테스트
 * 
 * 실행 방법:
 * k6 run --out prometheus=namespace=k6 load_test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const fastPassHitRate = new Rate('fast_pass_hits');
const analysisLatency = new Trend('analysis_latency');
const requestCounter = new Counter('requests_total');

// 테스트 설정
export const options = {
  // 시나리오 기반 부하 테스트
  scenarios: {
    // 1. 일반 부하 테스트
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },   // 워밍업
        { duration: '5m', target: 50 },   // 정상 부하
        { duration: '2m', target: 100 },  // 피크 부하
        { duration: '5m', target: 50 },   // 안정화
        { duration: '2m', target: 0 },    // 종료
      ],
      gracefulRampDown: '30s',
    },
    
    // 2. 스파이크 테스트
    spike_test: {
      executor: 'ramping-vus',
      startTime: '20m',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 }, // 급격한 증가
        { duration: '1m', target: 200 },  // 유지
        { duration: '30s', target: 0 },   // 급격한 감소
      ],
    },
    
    // 3. 스트레스 테스트
    stress_test: {
      executor: 'ramping-vus',
      startTime: '25m',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 300 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  
  // SLO 임계값
  thresholds: {
    // 가용성: 99.5% 이상
    'http_req_failed': ['rate<0.005'],
    
    // 응답 시간
    'http_req_duration': [
      'p(50)<800',    // P50 < 800ms
      'p(95)<2000',   // P95 < 2초
      'p(99)<5000',   // P99 < 5초
    ],
    
    // Fast Pass 응답 시간
    'http_req_duration{fast_pass:true}': [
      'p(95)<200',    // P95 < 200ms
    ],
    
    // 에러율: 1% 미만
    'errors': ['rate<0.01'],
    
    // Fast Pass 적중률: 20% 이상
    'fast_pass_hits': ['rate>0.20'],
  },
};

// 테스트 데이터
const TEST_VIDEOS = [
  'fake_0.mp4',
  'fake_1.mp4',
  'fake_2.mp4',
  'real_0.mp4',
  'real_1.mp4',
];

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// 메인 테스트 함수
export default function () {
  const videoPath = TEST_VIDEOS[Math.floor(Math.random() * TEST_VIDEOS.length)];
  
  // 1. analyze_frames 테스트
  testAnalyzeFrames(videoPath);
  
  // 2. get_frame_sample 테스트 (20% 확률)
  if (Math.random() < 0.2) {
    testGetFrameSample(videoPath);
  }
  
  // 3. extract_embedding 테스트 (10% 확률)
  if (Math.random() < 0.1) {
    testExtractEmbedding();
  }
  
  // 4. search_similar_videos 테스트 (10% 확률)
  if (Math.random() < 0.1) {
    testSearchSimilar();
  }
  
  sleep(1);
}

function testAnalyzeFrames(videoPath) {
  const payload = JSON.stringify({
    tool: 'analyze_frames',
    arguments: {
      video_path: videoPath,
      enable_fast_pass: true,
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'analyze_frames' },
  };
  
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/mcp/tool`, payload, params);
  const duration = Date.now() - startTime;
  
  requestCounter.add(1);
  analysisLatency.add(duration);
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
  
  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    
    // Fast Pass 체크
    try {
      const body = JSON.parse(response.body);
      if (body.fast_pass === true) {
        fastPassHitRate.add(1);
        
        // Fast Pass 응답 시간 태그
        response.tags = { ...response.tags, fast_pass: 'true' };
      } else {
        fastPassHitRate.add(0);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
  }
}

function testGetFrameSample(videoPath) {
  const payload = JSON.stringify({
    tool: 'get_frame_sample',
    arguments: {
      video_path: videoPath,
      num_frames: 16,
      method: 'uniform',
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'get_frame_sample' },
  };
  
  const response = http.post(`${BASE_URL}/mcp/tool`, payload, params);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}

function testExtractEmbedding() {
  // 임의의 analysis_id 사용 (실제로는 이전 분석 결과 사용)
  const analysisId = 'test-analysis-id';
  
  const payload = JSON.stringify({
    tool: 'extract_embedding',
    arguments: {
      analysis_id: analysisId,
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'extract_embedding' },
  };
  
  const response = http.post(`${BASE_URL}/mcp/tool`, payload, params);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}

function testSearchSimilar() {
  const analysisId = 'test-analysis-id';
  
  const payload = JSON.stringify({
    tool: 'search_similar_videos',
    arguments: {
      analysis_id: analysisId,
      limit: 5,
      threshold: 0.7,
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'search_similar_videos' },
  };
  
  const response = http.post(`${BASE_URL}/mcp/tool`, payload, params);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}

// 테스트 시작 시 실행
export function setup() {
  console.log('='.repeat(60));
  console.log('PawFiler Video Analysis - Load Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Videos: ${TEST_VIDEOS.length}`);
  console.log('='.repeat(60));
}

// 테스트 종료 시 실행
export function teardown(data) {
  console.log('='.repeat(60));
  console.log('Load Test Completed');
  console.log('='.repeat(60));
}

// 결과 요약
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n';
  summary += `${indent}=`.repeat(60) + '\n';
  summary += `${indent}Load Test Summary\n`;
  summary += `${indent}=`.repeat(60) + '\n';
  
  // 요청 통계
  const requests = data.metrics.http_reqs;
  summary += `${indent}Total Requests: ${requests.values.count}\n`;
  summary += `${indent}Request Rate: ${requests.values.rate.toFixed(2)} req/s\n`;
  
  // 응답 시간
  const duration = data.metrics.http_req_duration;
  summary += `${indent}\nResponse Time:\n`;
  summary += `${indent}  P50: ${duration.values['p(50)'].toFixed(2)}ms\n`;
  summary += `${indent}  P95: ${duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  P99: ${duration.values['p(99)'].toFixed(2)}ms\n`;
  
  // 에러율
  const failed = data.metrics.http_req_failed;
  summary += `${indent}\nError Rate: ${(failed.values.rate * 100).toFixed(2)}%\n`;
  
  // SLO 달성 여부
  summary += `${indent}\nSLO Status:\n`;
  summary += `${indent}  Availability (99.5%): ${failed.values.rate < 0.005 ? '✓ PASS' : '✗ FAIL'}\n`;
  summary += `${indent}  P95 Latency (<2s): ${duration.values['p(95)'] < 2000 ? '✓ PASS' : '✗ FAIL'}\n`;
  summary += `${indent}  P99 Latency (<5s): ${duration.values['p(99)'] < 5000 ? '✓ PASS' : '✗ FAIL'}\n`;
  
  summary += `${indent}=`.repeat(60) + '\n';
  
  return summary;
}
