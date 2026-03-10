#!/bin/bash

# 부하테스트 검증 스크립트

echo "🔍 부하테스트 상태 확인"
echo "======================="
echo ""

# 1. k6 설치 확인
echo "1️⃣ k6 설치 확인..."
if command -v k6 &> /dev/null; then
    echo "✅ k6 설치됨: $(k6 version)"
else
    echo "❌ k6가 설치되지 않음"
    echo "   설치: brew install k6 (macOS) 또는 https://k6.io/docs/getting-started/installation/"
fi
echo ""

# 2. AWS 엔드포인트 확인
echo "2️⃣ AWS 엔드포인트 확인..."
if [ -z "$AWS_ENDPOINT" ]; then
    echo "⚠️  AWS_ENDPOINT 환경변수가 설정되지 않음"
    echo "   설정: export AWS_ENDPOINT=https://YOUR_DOMAIN"
else
    echo "✅ AWS_ENDPOINT: $AWS_ENDPOINT"
    
    # 엔드포인트 연결 테스트
    echo "   연결 테스트 중..."
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$AWS_ENDPOINT" > /dev/null 2>&1; then
        echo "   ✅ 엔드포인트 접근 가능"
    else
        echo "   ❌ 엔드포인트 접근 불가 (타임아웃 또는 연결 실패)"
    fi
fi
echo ""

# 3. 이전 테스트 결과 확인
echo "3️⃣ 이전 테스트 결과 확인..."
if [ -d "backend/results" ]; then
    result_count=$(ls -1 backend/results/*.json 2>/dev/null | wc -l)
    if [ "$result_count" -gt 0 ]; then
        echo "✅ 테스트 결과 파일 발견: ${result_count}개"
        echo ""
        echo "   최근 결과 파일:"
        ls -lh backend/results/*.json | tail -5
        echo ""
        
        # summary 파일 확인
        summary_count=$(ls -1 backend/results/*-summary.json 2>/dev/null | wc -l)
        if [ "$summary_count" -gt 0 ]; then
            echo "   요약 파일:"
            latest_summary=$(ls -t backend/results/*-summary.json 2>/dev/null | head -1)
            if [ -f "$latest_summary" ]; then
                echo "   📊 최근 요약: $latest_summary"
                cat "$latest_summary" | jq '.' 2>/dev/null || cat "$latest_summary"
            fi
        else
            echo "   ⚠️  요약 파일 없음 (테스트가 완료되지 않았을 수 있음)"
        fi
    else
        echo "⚠️  테스트 결과 파일 없음"
    fi
else
    echo "⚠️  results 디렉토리 없음"
fi
echo ""

# 4. 간단한 연결 테스트 제안
echo "4️⃣ 빠른 연결 테스트 (10초)..."
if [ ! -z "$AWS_ENDPOINT" ] && command -v k6 &> /dev/null; then
    echo "   테스트 실행 중..."
    
    # 임시 테스트 스크립트 생성
    cat > /tmp/quick-test.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '10s',
};

export default function() {
  const res = http.get(__ENV.BASE_URL || 'https://example.com');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
EOF
    
    BASE_URL="$AWS_ENDPOINT" k6 run --quiet /tmp/quick-test.js
    rm /tmp/quick-test.js
else
    echo "   ⏭️  건너뜀 (k6 또는 AWS_ENDPOINT 없음)"
fi
echo ""

echo "======================="
echo "✅ 검증 완료"
echo ""
echo "💡 다음 단계:"
echo "   1. AWS_ENDPOINT 설정: export AWS_ENDPOINT=https://YOUR_DOMAIN"
echo "   2. 부하테스트 실행: ./backend/scripts/load-test.sh"
echo "   3. 결과 확인: cat backend/results/*-summary.json | jq"
