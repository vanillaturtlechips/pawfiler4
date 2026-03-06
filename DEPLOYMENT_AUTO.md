# PawFiler 자동 배포 가이드

## 🚀 빠른 시작

### 1. 로컬에서 전체 배포 (한 번에)
```bash
./scripts/deploy-all-auto.sh
```

이 스크립트는 자동으로:
- Terraform 인프라 배포 (EKS, RDS, VPC, S3)
- Helm 차트 설치 (ALB Controller, ArgoCD, Kubecost)
- Docker 이미지 빌드 및 ECR 푸시
- ArgoCD ApplicationSet 배포

### 2. GitHub Actions CI/CD (자동화)

#### 필요한 Secrets 설정
GitHub 레포 Settings → Secrets and variables → Actions:

```
AWS_ROLE_ARN: arn:aws:iam::009946608368:role/GitHubActionsECRRole
ECR_REGISTRY: 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com
ARGOCD_REPO_TOKEN: ghp_xxxxxxxxxxxxx (ArgoCD 레포 접근용)
```

#### 동작 방식
1. `backend/services/` 하위 변경 감지
2. 변경된 서비스만 Docker 빌드 및 ECR 푸시
3. ArgoCD 레포의 이미지 태그 자동 업데이트
4. ArgoCD가 자동으로 EKS에 배포

## 📋 수동 배포 (단계별)

### Step 1: Terraform 인프라
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Step 2: EKS 접속 설정
```bash
aws eks update-kubeconfig --name pawfiler-eks-cluster --region ap-northeast-2
kubectl get nodes
```

### Step 3: Docker 이미지 빌드
```bash
./scripts/build-and-push.sh
```

### Step 4: ArgoCD Secret 업데이트
```bash
# RDS 엔드포인트 확인
cd terraform
terraform output rds_instance_address

# ArgoCD 레포의 db-credentials.yaml 업데이트
cd ~/Documents/finalproject/pawfiler4-argocd
vi apps/base/db-credentials.yaml
# DB_HOST를 실제 RDS 엔드포인트로 변경
git add . && git commit -m "Update RDS endpoint" && git push
```

### Step 5: ArgoCD 배포
```bash
kubectl apply -f ~/Documents/finalproject/pawfiler4-argocd/applicationset.yaml

# ArgoCD 비밀번호 확인
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

## 🔍 배포 확인

### ArgoCD 대시보드
```bash
kubectl port-forward -n argocd svc/argocd-server 8080:443
# https://localhost:8080
```

### Kubecost 대시보드
```bash
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
# http://localhost:9090
```

### 서비스 상태
```bash
kubectl get pods -n pawfiler
kubectl get gateway -n pawfiler
kubectl get httproute -n pawfiler
```

### ALB 엔드포인트
```bash
kubectl get gateway pawfiler-gateway -n pawfiler -o jsonpath='{.status.addresses[0].value}'
```

## 🛠️ 트러블슈팅

### Helm 차트 설치 실패
```bash
# Helm 차트 상태 확인
helm list -A

# 재설치
helm uninstall aws-load-balancer-controller -n kube-system
cd terraform && terraform apply -replace=helm_release.aws_load_balancer_controller
```

### ArgoCD 동기화 실패
```bash
# ArgoCD 앱 상태 확인
kubectl get applications -n argocd

# 수동 동기화
kubectl patch application pawfiler-quiz -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

### Pod 시작 실패
```bash
kubectl describe pod <pod-name> -n pawfiler
kubectl logs <pod-name> -n pawfiler
```

## 💰 비용 절감

### 개발 환경 중지
```bash
cd terraform
./stop-eks.sh  # 노드 그룹 스케일 다운
```

### 개발 환경 재시작
```bash
./start-eks.sh
```

## 🔄 업데이트 워크플로우

### 코드 변경 시 (자동)
```bash
git add .
git commit -m "Update quiz service"
git push origin main
# GitHub Actions가 자동으로 빌드 및 배포
```

### 수동 이미지 업데이트
```bash
# 이미지 빌드
./scripts/build-and-push.sh

# ArgoCD 레포 업데이트
cd ~/Documents/finalproject/pawfiler4-argocd
# deployment.yaml의 이미지 태그 변경
git push

# ArgoCD가 자동으로 감지하여 배포
```
