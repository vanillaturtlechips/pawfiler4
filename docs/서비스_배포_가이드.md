# PawFiler 배포 가이드

마지막 업데이트: 2026-03-09

## 목차
- [빠른 시작](#빠른-시작)
- [인프라 배포](#인프라-배포)
- [서비스 배포](#서비스-배포)
- [모니터링](#모니터링)
- [비용 관리](#비용-관리)

---

## 빠른 시작

### 전체 자동 배포
```bash
cd terraform
./infra.sh
# 1) 기본 인프라 생성
# 2) EKS 시작
# 4) RDS 생성
```

---

## 인프라 배포

### 1. Terraform 초기화
```bash
cd terraform
terraform init
cp terraform.tfvars.example terraform.tfvars
```

### 2. 필수 설정 (terraform.tfvars)
```hcl
aws_region   = "ap-northeast-2"
project_name = "pawfiler"

# EKS
cluster_name = "pawfiler-eks-cluster"
eks_version  = "1.31"

# RDS
database_username = "pawfiler"
database_password = "CHANGE_ME"  # 강력한 비밀번호로 변경

# Bastion
bastion_key_name = "your-key-pair-name"  # EC2 키페어 이름

# Karpenter (EKS 1.31에서는 비활성화 권장)
enable_karpenter = false
```

### 3. 인프라 생성
```bash
./infra.sh
```

**생성되는 리소스:**
- VPC (Public/Private Subnets, NAT Gateway)
- EKS Cluster (v1.31)
- RDS PostgreSQL (16.3)
- ECR (4개 레포지토리)
- S3 (Frontend, Admin Frontend, Quiz Media)
- CloudFront (2개 배포)
- Bastion Host
- IAM Roles (IRSA)

**자동 설치되는 Helm 차트:**
- AWS Load Balancer Controller
- ArgoCD
- Kubecost
- Metrics Server
- Grafana
- Envoy Gateway

---

## 서비스 배포

### 1. kubectl 설정
```bash
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
kubectl get nodes
```

### 2. Docker 이미지 빌드 & 푸시
```bash
cd scripts
./build-and-push.sh
```

### 3. Kubernetes 배포

#### k8s 폴더 사용 (순수 매니페스트)
```bash
cd k8s

# 네임스페이스 생성
kubectl apply -f namespace.yaml
kubectl apply -f admin/namespace.yaml

# DB Secret 설정 (실제 값으로 교체)
kubectl apply -f db-secret.yaml
kubectl apply -f admin/db-secret.yaml

# 서비스 배포
kubectl apply -f quiz-service.yaml
kubectl apply -f community-service.yaml
kubectl apply -f admin/admin-service.yaml

# Envoy Proxy (gRPC-JSON transcoding)
kubectl apply -f proto-configmap.yaml
kubectl apply -f envoy-proxy.yaml
kubectl apply -f envoy-ingress.yaml

# ALB 도메인 확인
kubectl get ingress -n pawfiler envoy-ingress
```

#### Helm 차트 사용 (권장)
```bash
cd helm/pawfiler

# values.yaml 수정 (이미지 태그, DB 정보 등)
helm install pawfiler . -n pawfiler --create-namespace
```

### 4. CloudFront Origin 업데이트
```bash
# ALB 도메인 확인
kubectl get ingress -n pawfiler envoy-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# terraform.tfvars에 추가
# envoy_alb_domain = "k8s-pawfiler-envoying-xxx.elb.amazonaws.com"

cd terraform
./infra.sh
# 10) CloudFront Origin 업데이트
```

### 5. 프론트엔드 배포
```bash
# 사용자 프론트엔드
cd frontend
npm run build
aws s3 sync dist/ s3://pawfiler-frontend --delete
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"

# 관리자 프론트엔드
cd admin-frontend
npm run build
aws s3 sync dist/ s3://pawfiler-admin-frontend --delete
```

---

## 모니터링

### ArgoCD (GitOps)
```bash
# Admin 비밀번호 확인
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# 브라우저: https://localhost:8080
# Username: admin
```

### Kubecost (비용 모니터링)
```bash
kubectl port-forward -n monitoring svc/kubecost-cost-analyzer 9090:9090

# 브라우저: http://localhost:9090
```

### Grafana (리소스 대시보드)
```bash
kubectl port-forward -n monitoring svc/grafana 3000:80

# 브라우저: http://localhost:3000
# Username: admin / Password: admin
```

---

## 비용 관리

### 월 예상 비용 (ap-northeast-2)
| 리소스 | 비용 |
|--------|------|
| EKS Cluster | $133 |
| RDS (db.t3.micro) | $15 |
| NAT Gateway | $32 |
| Bastion (t3.micro) | $8 |
| EKS 노드 (t3.medium x2) | ~$50 |
| **합계** | **~$238/월** |

### 비용 절감 팁

#### 1. 개발 환경 중지
```bash
cd terraform
./infra.sh
# 3) EKS 중지 (노드 그룹 스케일 다운)
# 7) Bastion 중지
```

#### 2. Spot 인스턴스 사용
- 현재 Spot 노드 그룹 활성화됨
- 약 70% 비용 절감

#### 3. ECR 이미지 정리
- Lifecycle Policy 설정됨 (최근 5개만 유지)

#### 4. Kubecost 권장사항 활용
- Savings 탭에서 최적화 제안 확인
- Underutilized Nodes 체크
- Right-sizing 권장사항 적용

---

## 트러블슈팅

### Pod CrashLoopBackOff
```bash
kubectl logs -n pawfiler <pod-name>
kubectl describe pod -n pawfiler <pod-name>
```

### DB 연결 실패
```bash
# Secret 확인
kubectl get secret -n pawfiler db-credentials -o yaml

# RDS 보안그룹 확인
# EKS 노드에서 RDS 접근 가능한지 확인
```

### IRSA 권한 오류
```bash
# ServiceAccount 확인
kubectl get sa -n admin admin-service -o yaml

# Pod에서 IAM Role 확인
kubectl exec -n admin deployment/admin-service -- env | grep AWS
```

### ALB Ingress 생성 안 됨
```bash
# ALB Controller 로그 확인
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Ingress 상태 확인
kubectl describe ingress -n pawfiler envoy-ingress
```

---

## 참고 문서

- [terraform/README.md](../terraform/README.md) - Terraform 상세 가이드
- [k8s/README.md](../k8s/README.md) - Kubernetes 매니페스트 가이드
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 시스템 아키텍처
