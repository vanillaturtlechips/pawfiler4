#!/bin/bash
# 바스쳔에서 실행 - 어드민 접속용 port-forward

AWS_REGION=${AWS_REGION:-ap-northeast-2}
CLUSTER_NAME=${CLUSTER_NAME:-pawfiler-eks-cluster}

echo "EKS 연결 중..."
aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

echo "어드민 서비스 port-forward 시작..."
echo "  브라우저에서 http://localhost:3000 접속"
echo "  종료: Ctrl+C"
echo ""

# 세 개 동시 port-forward
kubectl port-forward svc/admin-frontend 3000:80 -n admin &
PF1=$!
kubectl port-forward svc/admin-service 8082:8082 -n admin &
PF2=$!
kubectl port-forward svc/envoy-gateway 8080:80 -n envoy-gateway-system &
PF3=$!

trap "kill $PF1 $PF2 $PF3 2>/dev/null" EXIT
wait
