# PawFiler AWS 프로덕션 부하 테스트 가이드

마지막 업데이트: 2026-03-10

## 개요
이 문서는 AWS EKS에 배포된 PawFiler 프로덕션 환경의 부하 테스트 계획과 실행 방법을 설명합니다.

## SLO (Service Level Objective)

### 1. 가용성 (Availability)
- **목표**: 99.95%
- **허용 다운타임**: 월 21.6분 (약 22분)

### 2. 응답 시간 (Latency)
- **최소**: 100ms (0.1초)
- **최대**: 1000ms (1초)
- **P50**: 200ms 이내
- **P95**: 500ms 이내
- **P99**: 1000ms 이내

### 3. 처리량 (Throughput)
- **평시**: 1000명 동시 접속
- **최대**: 5000명 동시 접속

### 4. 오류율 (Error Rate)
- **목표**: 0%

---

## 테스트 환경

### AWS 프로덕션 환경 (권장)
```bash
# CloudFront 도메인 확인
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='PawFiler Frontend'].DomainName" \
  --output text

# 또는 ALB 도메인 확인
kubectl get ingress -n pawfiler envoy-ingress \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### 테스트 도구
- **k6**: 현대적인 JS 기반 부하 테스트 도구 (권장)

## 테스트 시나리오

### 1. 평시 부하 테스트 (Normal Load)
- **동시 사용자**: 1000명
- **지속 시간**: 10분
- **목적**: 평시 트래픽 처리 능력 확인

### 2. 최대 부하 테스트 (Peak Load)
- **동시 사용자**: 5000명 (점진적 증가)
- **지속 시간**: 17분
  - 2분: 1000명 → 3000명
  - 3분: 3000명 → 5000명
  - 10분: 5000명 유지
  - 2분: 5000명 → 1000명
- **목적**: 최대 수용 인원 확인

### 3. 스트레스 테스트 (Stress Test)
- **동시 사용자**: 점진적 증가 (1000명 → 7000명)
- **지속 시간**: 30분
- **목적**: 시스템 한계점 파악

### 4. 스파이크 테스트 (Spike Test)
- **동시 사용자**: 급격한 증가 (1000명 → 5000명 → 1000명)
- **지속 시간**: 15분
- **목적**: 급격한 트래픽 변화 대응 능력 확인

## 테스트 실행 방법

### 1. k6 설치
```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows
choco install k6
```

### 2. AWS 엔드포인트 확인
```bash
# CloudFront 도메인 확인
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='PawFiler Frontend'].DomainName" \
  --output text

# ALB 도메인 확인
kubectl get ingress -n pawfiler envoy-ingress \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### 3. 테스트 실행
```bash
# AWS 엔드포인트 설정
export AWS_ENDPOINT=https://YOUR_CLOUDFRONT_DOMAIN
# 또는
export AWS_ENDPOINT=http://YOUR_ALB_DOMAIN

# 테스트 실행
cd backend
chmod +x scripts/load-test.sh
./scripts/load-test.sh
```

테스트 시나리오 선택:
1. 평시 부하 테스트 (1000명, 10분)
2. 최대 부하 테스트 (5000명, 17분)
3. 스트레스 테스트 (점진적 증가, 30분)
4. 스파이크 테스트 (급격한 증가, 15분)
5. 전체 테스트 (모든 시나리오, 약 1시간)

## AWS 리소스 모니터링

### 1. EKS Pod 상태 확인
```bash
# Pod CPU/메모리 사용률
kubectl top pods -n pawfiler

# Pod 로그 확인
kubectl logs -n pawfiler deployment/quiz-service --tail=100 -f
kubectl logs -n pawfiler deployment/community-service --tail=100 -f
kubectl logs -n pawfiler deployment/envoy-proxy --tail=100 -f
```

### 2. Grafana 대시보드 (EKS 내부)
```bash
kubectl port-forward -n monitoring svc/grafana 3000:80
# http://localhost:3000 (admin/admin)
```

### 3. Kubecost (비용 모니터링)
```bash
kubectl port-forward -n monitoring svc/kubecost-cost-analyzer 9090:9090
# http://localhost:9090
```

### 4. CloudWatch 메트릭
```bash
# ALB 응답 시간
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=YOUR_ALB_NAME \
  --start-time 2026-03-10T00:00:00Z \
  --end-time 2026-03-10T23:59:59Z \
  --period 300 \
  --statistics Average

# RDS CPU 사용률
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=pawfiler-db \
  --start-time 2026-03-10T00:00:00Z \
  --end-time 2026-03-10T23:59:59Z \
  --period 300 \
  --statistics Average
```

## 결과 분석

### SLO 달성 기준
✅ **가용성**: 99.95% 이상  
✅ **P50 응답 시간**: 200ms 이내  
✅ **P95 응답 시간**: 500ms 이내  
✅ **P99 응답 시간**: 1000ms 이내  
✅ **오류율**: 0%  
✅ **평시 처리량**: 1000명 동시 접속  
✅ **최대 처리량**: 5000명 동시 접속  

### 병목 지점 파악
- EKS Pod CPU/메모리 사용률 > 80%
- RDS CPU 사용률 > 80%
- ALB 응답 시간 증가
- DB 연결 수 고갈

### 개선 방안
1. **수평 확장**: HPA (Horizontal Pod Autoscaler) 설정
2. **수직 확장**: Pod 리소스 증가
3. **캐싱**: Redis 추가
4. **DB 최적화**: 인덱스 추가, 쿼리 최적화
5. **CDN**: CloudFront 캐싱 정책 최적화

## 트러블슈팅

### 응답 시간 초과
```bash
# Pod 로그 확인
kubectl logs -n pawfiler deployment/quiz-service --tail=100

# Pod 리소스 확인
kubectl top pods -n pawfiler

# HPA 상태 확인
kubectl get hpa -n pawfiler
```

### 오류 발생
```bash
# Pod 상태 확인
kubectl get pods -n pawfiler

# Pod 이벤트 확인
kubectl describe pod -n pawfiler <pod-name>

# RDS 연결 확인
kubectl exec -n pawfiler deployment/quiz-service -- pg_isready -h <RDS_ENDPOINT>
```
