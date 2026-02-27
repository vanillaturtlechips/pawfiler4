#!/bin/bash
set -e

echo "💰 Kubecost 대시보드 접속..."

# Port forward
echo "🔗 Port forwarding 시작 (localhost:9090)..."
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090 &
PID=$!

echo ""
echo "✅ Kubecost 대시보드 접속 가능:"
echo "   URL: http://localhost:9090"
echo ""
echo "주요 기능:"
echo "  - 실시간 클러스터 비용 모니터링"
echo "  - 네임스페이스/Pod별 비용 분석"
echo "  - 비용 최적화 권장사항"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."

# Ctrl+C 처리
trap "kill $PID 2>/dev/null" EXIT

wait $PID
