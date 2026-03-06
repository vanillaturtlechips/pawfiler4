# Helm & ArgoCD & Kubecost 가이드

## 개요

이 프로젝트는 다음 도구들을 Terraform으로 자동 설치합니다:
- **AWS Load Balancer Controller**: ALB Ingress 지원
- **ArgoCD**: GitOps 기반 CD 자동화
- **Kubecost**: 실시간 Kubernetes 비용 모니터링
- **Metrics Server**: HPA (Horizontal Pod Autoscaler) 지원

## 1. Terraform 배포 시 자동 설치

```bash
cd terraform
terraform apply
```

위 명령어 실행 시 모든 Helm 차트가 자동으로 설치됩니다.

## 2. ArgoCD 사용법

### 초기 설정
```bash
# ArgoCD 설정 스크립트 실행
./scripts/setup-argocd.sh
```

### 수동 설정
```bash
# Admin 비밀번호 확인
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# ArgoCD Server URL 확인
kubectl get svc argocd-server -n argocd

# Port forward (로컬 접속)
kubectl port-forward svc/argocd-server -n argocd 8080:443

# 브라우저에서 https://localhost:8080 접속
# Username: admin
# Password: 위에서 확인한 비밀번호
```

### ArgoCD로 애플리케이션 배포

1. **Git 리포지토리에 k8s 매니페스트 푸시**
   ```bash
   git add k8s/
   git commit -m "Add Kubernetes manifests"
   git push origin main
   ```

2. **ArgoCD Application 생성**
   ```bash
   # argocd/application.yaml 파일 수정 (Git URL 변경)
   kubectl apply -f argocd/application.yaml
   ```

3. **자동 동기화 확인**
   - ArgoCD UI에서 애플리케이션 상태 확인
   - Git 변경 시 자동으로 클러스터에 반영됨

### ArgoCD CLI 사용
```bash
# CLI 설치
brew install argocd  # macOS
# 또는
curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /usr/local/bin/argocd

# 로그인
argocd login <ARGOCD_SERVER> --username admin --password <PASSWORD>

# 앱 목록
argocd app list

# 앱 동기화
argocd app sync pawfiler-app

# 앱 상태 확인
argocd app get pawfiler-app
```

## 3. Kubecost 사용법

### 대시보드 접속
```bash
# 간편 스크립트
./scripts/kubecost-dashboard.sh

# 또는 수동
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
# 브라우저에서 http://localhost:9090 접속
```

### 주요 기능
- **Cost Allocation**: 네임스페이스/Pod/서비스별 비용
- **Savings**: 비용 절감 권장사항
- **Reports**: 일별/월별 비용 리포트
- **Alerts**: 비용 임계값 알림

### Kubecost API 사용
```bash
# 네임스페이스별 비용 (최근 7일)
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090 &
curl "http://localhost:9090/model/allocation?window=7d&aggregate=namespace"

# 월별 비용 요약
curl "http://localhost:9090/model/allocation?window=month&aggregate=cluster"
```

## 4. Infracost vs Kubecost

| 도구 | 시점 | 용도 |
|------|------|------|
| **Infracost** | 배포 전 | Terraform 코드 기반 비용 예측 |
| **Kubecost** | 배포 후 | 실제 클러스터 리소스 사용량 기반 비용 |

### Infracost 사용 (배포 전 예측)
```bash
# 설치
brew install infracost

# API 키 설정
infracost auth login

# 비용 예측
cd terraform
infracost breakdown --path .

# 변경 사항 비용 비교
infracost diff --path .
```

### Kubecost 사용 (배포 후 실제 비용)
```bash
# 대시보드 접속
./scripts/kubecost-dashboard.sh

# 네임스페이스별 비용 확인
# UI에서 "Allocations" 메뉴 → "pawfiler" 네임스페이스 선택
```

## 5. GitOps 워크플로우 (ArgoCD)

### 배포 프로세스
```
개발자 → Git Push → ArgoCD 감지 → 자동 배포 → EKS 클러스터
```

### 예시: 새 버전 배포
```bash
# 1. 이미지 빌드 및 푸시
./scripts/build-and-push.sh

# 2. k8s 매니페스트 업데이트 (이미지 태그 변경)
# k8s/quiz-service.yaml에서 image 태그를 v1.2.0으로 변경

# 3. Git에 커밋
git add k8s/quiz-service.yaml
git commit -m "Update quiz-service to v1.2.0"
git push

# 4. ArgoCD가 자동으로 감지하고 배포
# (또는 수동 동기화: argocd app sync pawfiler-app)
```

## 6. 비용 최적화 팁

### Kubecost 권장사항 활용
1. Kubecost 대시보드 → "Savings" 탭
2. 다음 항목 확인:
   - Underutilized Nodes (사용률 낮은 노드)
   - Abandoned Resources (사용하지 않는 리소스)
   - Right-sizing (Pod 리소스 최적화)

### 개발 환경 자동 중지
```bash
# 야간/주말 자동 중지 (비용 절감)
cd terraform
./stop-eks.sh  # 노드 그룹 0으로 스케일
./stop-bastion.sh  # Bastion 중지

# 업무 시작 시 재시작
./start-eks.sh
./start-bastion.sh
```

## 7. 모니터링 대시보드 한눈에 보기

```bash
# ArgoCD (배포 상태)
kubectl port-forward svc/argocd-server -n argocd 8080:443
# https://localhost:8080

# Kubecost (비용)
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
# http://localhost:9090

# Kubernetes Dashboard (선택사항)
kubectl proxy
# http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

## 트러블슈팅

### Helm 차트 설치 실패
```bash
# Helm 릴리스 상태 확인
helm list -A

# 특정 릴리스 삭제 후 재설치
helm uninstall argocd -n argocd
terraform apply -target=helm_release.argocd
```

### ArgoCD 동기화 실패
```bash
# 로그 확인
kubectl logs -n argocd deployment/argocd-application-controller

# 수동 동기화
argocd app sync pawfiler-app --force
```

### Kubecost 데이터 없음
```bash
# Prometheus 상태 확인
kubectl get pods -n kubecost

# 15분 정도 대기 후 데이터 수집 시작
```
