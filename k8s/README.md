# Kubernetes 배포 가이드

## 📋 사전 준비

1. **EKS 클러스터 생성**
   ```bash
   cd ../terraform
   ./infra.sh
   # 1) 기본 인프라 생성
   # 2) EKS 시작
   ```

2. **kubectl 설정**
   ```bash
   aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
   kubectl get nodes
   ```

3. **ECR 이미지 빌드 & 푸시**
   ```bash
   cd ../scripts
   ./build-and-push.sh
   ```

## 🚀 배포 순서

### 1. 네임스페이스 생성
```bash
kubectl apply -f namespace.yaml
kubectl apply -f admin/namespace.yaml
```

### 2. DB Secret 설정
```bash
# RDS 엔드포인트 확인
cd ../terraform
terraform output rds_instance_endpoint

# Secret 파일 수정 (실제 값으로 교체)
# - db-secret.yaml
# - admin/db-secret.yaml

# Secret 적용
kubectl apply -f db-secret.yaml
kubectl apply -f admin/db-secret.yaml
```

### 3. 서비스 배포
```bash
# gRPC 서비스
kubectl apply -f quiz-service.yaml
kubectl apply -f community-service.yaml

# Admin 서비스 (IRSA 포함)
kubectl apply -f admin/admin-service.yaml

# 배포 확인
kubectl get pods -n pawfiler
kubectl get pods -n admin
```

### 4. Envoy Proxy 배포
```bash
# Proto descriptor ConfigMap
kubectl apply -f proto-configmap.yaml

# Envoy Proxy (gRPC-JSON transcoding)
kubectl apply -f envoy-proxy.yaml

# NLB 도메인 확인
kubectl get svc -n pawfiler envoy-proxy
```

### 5. CloudFront Origin 업데이트
```bash
# terraform.tfvars에 Envoy NLB 도메인 추가
cd ../terraform
# envoy_nlb_domain = "k8s-pawfiler-envoypro-xxx.elb.ap-northeast-2.amazonaws.com"

./infra.sh
# 10) CloudFront Origin 업데이트
```

## 📁 파일 구조

```
k8s/
├── namespace.yaml              # pawfiler 네임스페이스
├── db-secret.yaml             # DB 자격증명 (pawfiler)
├── quiz-service.yaml          # Quiz gRPC 서비스
├── community-service.yaml     # Community gRPC 서비스
├── proto-configmap.yaml       # Proto descriptor
├── envoy-proxy.yaml           # Envoy Proxy (NLB)
└── admin/
    ├── namespace.yaml         # admin 네임스페이스
    ├── db-secret.yaml        # DB 자격증명 (admin)
    └── admin-service.yaml    # Admin REST API (IRSA)
```

## 🔧 주요 설정

### IRSA (IAM Roles for Service Accounts)
- Admin 서비스가 S3에 업로드하기 위한 권한
- `admin/admin-service.yaml`의 ServiceAccount에 IAM Role ARN 설정 필요
- Terraform에서 자동 생성: `terraform/irsa.tf`

### Envoy Proxy
- gRPC-JSON transcoding 제공
- `/api` prefix 제거 (Lua filter)
- NLB로 노출되어 CloudFront Origin으로 사용

### 환경 변수 교체 필요
- `<AWS_ACCOUNT_ID>`: AWS 계정 ID
- `<RDS_ENDPOINT>`: RDS 엔드포인트
- `<DB_USERNAME>`, `<DB_PASSWORD>`: DB 자격증명
- `<ADMIN_SERVICE_ROLE_ARN>`: Admin IRSA Role ARN
- `<QUIZ_MEDIA_CLOUDFRONT_DOMAIN>`: Quiz Media CloudFront 도메인

## 🔍 확인 명령어

```bash
# Pod 상태
kubectl get pods -n pawfiler
kubectl get pods -n admin

# 서비스 확인
kubectl get svc -n pawfiler
kubectl get svc -n admin

# 로그 확인
kubectl logs -n pawfiler deployment/quiz-service
kubectl logs -n admin deployment/admin-service

# Envoy 테스트
ENVOY_URL=$(kubectl get svc -n pawfiler envoy-proxy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -X POST http://$ENVOY_URL/api/quiz.QuizService/GetRandomQuestion \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 🆘 문제 해결

### Pod CrashLoopBackOff
```bash
kubectl logs -n pawfiler <pod-name>
kubectl describe pod -n pawfiler <pod-name>
```

### DB 연결 실패
```bash
# Secret 확인
kubectl get secret -n pawfiler db-credentials -o yaml

# RDS 보안그룹 확인 (EKS 노드에서 접근 가능한지)
```

### IRSA 권한 오류
```bash
# ServiceAccount 확인
kubectl get sa -n admin admin-service -o yaml

# Pod에서 IAM Role 확인
kubectl exec -n admin deployment/admin-service -- env | grep AWS
```

## ⚠️ 주의사항

1. **Secret 파일은 git에 커밋하지 않음**
   - 실제 값이 포함된 파일은 로컬에만 보관
   - 운영 환경에서는 AWS Secrets Manager 사용 권장

2. **이미지 태그 관리**
   - `:latest` 대신 버전 태그 사용 권장
   - 예: `:v1.0.0`, `:20250308-abc123`

3. **리소스 제한 설정**
   - 운영 환경에서는 `resources.limits` 설정 필수
