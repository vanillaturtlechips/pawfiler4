#!/bin/bash

# PawFiler AWS 프로덕션 환경 부하 테스트 실행 스크립트

set -e

echo "🚀 PawFiler AWS 부하 테스트 시작"
echo "================================"

# AWS 엔드포인트 확인
if [ -z "$AWS_ENDPOINT" ]; then
    echo "❌ AWS_ENDPOINT 환경 변수가 설정되지 않았습니다."
    echo ""
    echo "사용법:"
    echo "  export AWS_ENDPOINT=https://YOUR_CLOUDFRONT_DOMAIN"
    echo "  또는"
    echo "  export AWS_ENDPOINT=http://YOUR_ALB_DOMAIN"
    echo ""
    echo "현재 배포된 엔드포인트 확인:"
    echo "  kubectl get ingress -n pawfiler envoy-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'"
    exit 1
fi

export BASE_URL="$AWS_ENDPOINT"

echo "📍 테스트 대상: $BASE_URL"
echo ""

# k6 설치 확인
if ! command -v k6 &> /dev/null; then
    echo "❌ k6가 설치되어 있지 않습니다."
    echo ""
    echo "macOS: brew install k6"
    echo "Linux: sudo apt-get install k6"
    echo "Windows: choco install k6"
    echo ""
    echo "자세한 설치 방법: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# 결과 디렉토리 생성
mkdir -p backend/results

# 테스트 시나리오 선택
echo "테스트 시나리오를 선택하세요:"
echo "1) 평시 부하 테스트 (1000명, 10분)"
echo "2) 최대 부하 테스트 (5000명, 17분)"
echo "3) 스트레스 테스트 (점진적 증가, 30분)"
echo "4) 스파이크 테스트 (급격한 증가, 15분)"
echo "5) 전체 테스트 (모든 시나리오, 약 1시간)"
read -p "선택 (1-5): " choice

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

case $choice in
  1)
    echo "📊 평시 부하 테스트 실행 중..."
    export TEST_SCENARIO=normal
    k6 run \
      --out json=backend/results/normal-load-${TIMESTAMP}.json \
      --summary-export=backend/results/normal-load-${TIMESTAMP}-summary.json \
      backend/scripts/load-test.js
    ;;
  2)
    echo "📊 최대 부하 테스트 실행 중..."
    export TEST_SCENARIO=peak
    k6 run \
      --out json=backend/results/peak-load-${TIMESTAMP}.json \
      --summary-export=backend/results/peak-load-${TIMESTAMP}-summary.json \
      backend/scripts/load-test.js
    ;;
  3)
    echo "📊 스트레스 테스트 실행 중..."
    export TEST_SCENARIO=stress
    k6 run \
      --out json=backend/results/stress-test-${TIMESTAMP}.json \
      --summary-export=backend/results/stress-test-${TIMESTAMP}-summary.json \
      backend/scripts/load-test.js
    ;;
  4)
    echo "📊 스파이크 테스트 실행 중..."
    export TEST_SCENARIO=spike
    k6 run \
      --out json=backend/results/spike-test-${TIMESTAMP}.json \
      --summary-export=backend/results/spike-test-${TIMESTAMP}-summary.json \
      backend/scripts/load-test.js
    ;;
  5)
    echo "📊 전체 테스트 실행 중..."
    export TEST_SCENARIO=all
    k6 run \
      --out json=backend/results/full-test-${TIMESTAMP}.json \
      --summary-export=backend/results/full-test-${TIMESTAMP}-summary.json \
      backend/scripts/load-test.js
    ;;
  *)
    echo "❌ 잘못된 선택입니다."
    exit 1
    ;;
esac

echo ""
echo "✅ 테스트 완료!"
echo "결과 파일: backend/results/*-${TIMESTAMP}*"
echo ""

# 결과 분석 리포트 생성
echo "📊 부하테스트 결과 분석 리포트"
echo "==============================="
echo ""

# 요약 파일 찾기
SUMMARY_FILE=$(ls backend/results/*-${TIMESTAMP}-summary.json 2>/dev/null | head -1)

if [ -f "$SUMMARY_FILE" ]; then
    echo "📈 성능 지표 요약:"
    echo "----------------"
    
    # jq가 있으면 JSON 파싱, 없으면 기본 정보만
    if command -v jq &> /dev/null; then
        # 처리량
        TOTAL_REQUESTS=$(jq -r '.metrics.http_reqs.count // "N/A"' "$SUMMARY_FILE")
        RPS=$(jq -r '.metrics.http_reqs.rate // "N/A"' "$SUMMARY_FILE")
        ITERATIONS=$(jq -r '.metrics.iterations.count // "N/A"' "$SUMMARY_FILE")
        
        # 응답 시간
        AVG_RESPONSE=$(jq -r '.metrics.http_req_duration.avg // "N/A"' "$SUMMARY_FILE")
        P50_RESPONSE=$(jq -r '.metrics.http_req_duration.med // "N/A"' "$SUMMARY_FILE")
        P95_RESPONSE=$(jq -r '.metrics["http_req_duration"].["p(95)"] // "N/A"' "$SUMMARY_FILE")
        MAX_RESPONSE=$(jq -r '.metrics.http_req_duration.max // "N/A"' "$SUMMARY_FILE")
        
        # 에러율
        HTTP_FAIL_RATE=$(jq -r '.metrics.http_req_failed.value // "N/A"' "$SUMMARY_FILE")
        ERROR_RATE=$(jq -r '.metrics.errors.value // "N/A"' "$SUMMARY_FILE")
        
        echo "🎯 처리량:"
        echo "  - 총 요청 수: $TOTAL_REQUESTS"
        echo "  - 초당 요청 수 (RPS): $(printf "%.1f" $RPS 2>/dev/null || echo $RPS)"
        echo "  - 완료된 시나리오: $ITERATIONS"
        echo ""
        
        echo "⏱️ 응답 시간:"
        echo "  - 평균: $(printf "%.1f" $AVG_RESPONSE 2>/dev/null || echo $AVG_RESPONSE)ms"
        echo "  - P50 (중간값): $(printf "%.1f" $P50_RESPONSE 2>/dev/null || echo $P50_RESPONSE)ms"
        echo "  - P95: $(printf "%.1f" $P95_RESPONSE 2>/dev/null || echo $P95_RESPONSE)ms"
        echo "  - 최대: $(printf "%.1f" $MAX_RESPONSE 2>/dev/null || echo $MAX_RESPONSE)ms"
        echo ""
        
        echo "❌ 에러율:"
        echo "  - HTTP 실패율: $(printf "%.2f" $(echo "$HTTP_FAIL_RATE * 100" | bc -l 2>/dev/null) 2>/dev/null || echo $HTTP_FAIL_RATE)%"
        echo "  - 전체 에러율: $(printf "%.2f" $(echo "$ERROR_RATE * 100" | bc -l 2>/dev/null) 2>/dev/null || echo $ERROR_RATE)%"
        echo ""
        
        # SLO 달성 여부 확인
        echo "🎯 SLO 달성 여부:"
        echo "----------------"
        
        # P50 < 200ms 체크
        if (( $(echo "$P50_RESPONSE < 200" | bc -l 2>/dev/null || echo 0) )); then
            echo "✅ P50 응답시간: $(printf "%.1f" $P50_RESPONSE)ms < 200ms"
        else
            echo "❌ P50 응답시간: $(printf "%.1f" $P50_RESPONSE)ms ≥ 200ms"
        fi
        
        # P95 < 500ms 체크
        if (( $(echo "$P95_RESPONSE < 500" | bc -l 2>/dev/null || echo 0) )); then
            echo "✅ P95 응답시간: $(printf "%.1f" $P95_RESPONSE)ms < 500ms"
        else
            echo "❌ P95 응답시간: $(printf "%.1f" $P95_RESPONSE)ms ≥ 500ms"
        fi
        
        # 에러율 < 5% 체크
        if (( $(echo "$HTTP_FAIL_RATE < 0.05" | bc -l 2>/dev/null || echo 0) )); then
            echo "✅ HTTP 실패율: $(printf "%.2f" $(echo "$HTTP_FAIL_RATE * 100" | bc -l))% < 5%"
        else
            echo "❌ HTTP 실패율: $(printf "%.2f" $(echo "$HTTP_FAIL_RATE * 100" | bc -l))% ≥ 5%"
        fi
        
        echo ""
        
    else
        echo "⚠️ jq가 설치되지 않아 상세 분석을 건너뜁니다."
        echo "설치: sudo apt-get install jq (Linux) 또는 brew install jq (macOS)"
        echo ""
    fi
    
    echo "📋 권장사항:"
    echo "------------"
    echo "1. 📊 상세 결과 확인: cat $SUMMARY_FILE | jq"
    echo "2. 🔍 실시간 모니터링:"
    echo "   - kubectl top nodes"
    echo "   - kubectl top pods -n pawfiler"
    echo "3. 📈 Grafana 대시보드: kubectl port-forward -n monitoring svc/grafana 3000:80"
    
else
    echo "⚠️ 요약 파일을 찾을 수 없습니다: backend/results/*-${TIMESTAMP}-summary.json"
fi

echo ""
echo "==============================="
echo "📊 결과 분석:"
echo "  - JSON 결과: backend/results/*-${TIMESTAMP}.json"
echo "  - 요약 결과: backend/results/*-${TIMESTAMP}-summary.json"
echo ""
echo "📈 AWS 리소스 모니터링:"
echo "  - Grafana: kubectl port-forward -n monitoring svc/grafana 3000:80"
echo "  - Kubecost: kubectl port-forward -n monitoring svc/kubecost-cost-analyzer 9090:9090"
echo "  - Pod 상태: kubectl top pods -n pawfiler"
