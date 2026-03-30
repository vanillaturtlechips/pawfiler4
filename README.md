# PawFiler

반려동물 딥페이크 탐지 교육 플랫폼. EKS + Istio + ArgoCD GitOps 기반으로 운영됩니다.

## 전체 아키텍처

```
[사용자/관리자]
      │ HTTPS
      ▼
[Route 53] → [CloudFront]
                 │
                 ├─ pawfiler.site       → S3 (React SPA)
                 ├─ admin.pawfiler.site → S3 (Admin SPA)
                 └─ /api/*             → ALB (Internet-facing)
                                              │
                                        [Istio Gateway]
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
                 quiz-service        community-service        auth-service
                 user-service         chat-bot-service      video-analysis
                        │
                   [ai-orchestration]
                   Ray Serve + GPU (g5.xlarge Spot)
                   XGBoost + CNN 딥페이크 탐지 앙상블

[Lambda] ← API Gateway → SQS → 리포트 생성 → RDS + S3
```

## 프로젝트 구조

```
pawfiler4/
├── frontend/              # 사용자 프론트엔드 (React + TypeScript + Vite)
├── admin-frontend/        # 관리자 프론트엔드 (React + TypeScript + Vite)
├── backend/services/
│   ├── quiz/              # 퀴즈 서비스 (Go, gRPC:50052 HTTP:8080)
│   ├── community/         # 커뮤니티 서비스 (Go, gRPC:50053 HTTP:8080)
│   ├── auth/              # 인증 서비스 (Go, HTTP:8084)
│   ├── user/              # 사용자 서비스 (Go, gRPC:50054 HTTP:8083)
│   ├── admin/             # 관리자 서비스 (Go, HTTP:8082)
│   ├── chat-bot/          # 챗봇 서비스 (HTTP:8088)
│   ├── video-analysis/    # 영상 분석 서비스 (Python, gRPC:50054 HTTP:8080)
│   └── ai-orchestration/  # Ray Serve ML 추론 (Python, GPU)
├── aiops/                 # AIOps 에이전트 (Bedrock Claude 기반 이상 탐지)
├── terraform/             # AWS 인프라 IaC
│   └── modules/
│       ├── networking/    # VPC, Subnet
│       ├── eks/           # EKS Cluster
│       ├── rds/           # PostgreSQL 16
│       ├── helm/          # ArgoCD, Kubecost, ALB Controller 등 Helm 배포
│       ├── irsa/          # IRSA 역할
│       ├── karpenter/     # Karpenter 노드 오토스케일러
│       ├── s3/            # S3 버킷
│       ├── ecr/           # ECR 리포지토리
│       └── lambda_report/ # 리포트 Lambda
└── docs/                  # 아키텍처, 트러블슈팅 문서
```

## 기술 스택

### 프론트엔드
- React 18 + TypeScript + Vite
- TailwindCSS + Shadcn UI
- CloudFront + S3 정적 호스팅

### 백엔드
| 서비스 | 언어 | 프로토콜 |
|---|---|---|
| quiz, community, user | Go | gRPC + HTTP |
| auth, admin | Go | HTTP REST |
| chat-bot | - | HTTP |
| video-analysis | Python | gRPC + HTTP |
| ai-orchestration | Python | Ray Serve (HTTP:8000) |

### 인프라
- **EKS**: v1.31, ap-northeast-2
- **서비스 메시**: Istio (mTLS STRICT, VirtualService, AuthorizationPolicy)
- **노드 오토스케일링**: Karpenter Spot (t3.medium / t3.large / t3a.medium)
- **관리형 노드그룹**: t3.medium On-Demand (시스템 워크로드)
- **데이터베이스**: RDS PostgreSQL 16 (db.t3.micro) + RDS Proxy
- **캐시**: Redis (K8s Deployment)
- **AI 추론**: Ray 2.41.0 on g5.xlarge Spot (Karpenter)
- **스토리지**: EFS (모델 가중치), S3 (미디어/로그/리포트)
- **GitOps**: ArgoCD → [pawfiler4-argocd](https://github.com/vanillaturtlechips/pawfiler4-argocd)
- **IaC**: Terraform (모듈화)

### Observability
| 컴포넌트 | 역할 |
|---|---|
| kube-prometheus-stack + AMP | 메트릭 수집 및 장기 보관 |
| Grafana | 대시보드 (infra / overview / services / traces) |
| Loki + OTel Collector | 로그 수집 (filelog → Loki → S3) |
| Tempo + OTel Collector | 분산 트레이싱 (Istio → OTel → Tempo) |
| AIOps (Bedrock Claude Haiku) | 이상 탐지 + 자동 복구 + SNS/Slack 알림 |
| Kubecost | 서비스별 비용 분석 |

## 인프라 배포

```bash
cd terraform
terraform init
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 수정 후

terraform apply
```

주요 모듈 단독 적용:
```bash
# Kubecost 설정 변경
terraform apply -target=module.helm.helm_release.kubecost

# IAM 정책 변경
terraform apply -target=module.helm.aws_iam_role_policy.kubecost
```

## K8s 매니페스트 배포 (GitOps)

모든 K8s 리소스는 [pawfiler4-argocd](https://github.com/vanillaturtlechips/pawfiler4-argocd) 저장소에서 ArgoCD가 자동 sync합니다.

```bash
# ArgoCD 접속
kubectl port-forward -n argocd svc/argocd-server 8080:443

# 특정 앱 강제 sync
argocd app sync <앱이름> --force
```

## 이미지 빌드 및 배포

CI/CD 파이프라인(GitHub Actions)이 main 브랜치 머지 시 자동으로:
1. ECR에 이미지 빌드 & 푸시
2. pawfiler4-argocd 저장소의 이미지 태그 업데이트
3. ArgoCD auto-sync로 롤링 업데이트

## Observability 접속

```bash
# Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80
# http://localhost:3000

# Kubecost
kubectl port-forward -n monitoring svc/kubecost-cost-analyzer 9090:9090
# http://localhost:9090

# Loki 라벨 확인
kubectl port-forward -n monitoring svc/loki 3100:3100
curl http://localhost:3100/loki/api/v1/labels | jq .
```

## AWS 리소스 요약

| 리소스 | 스펙 |
|---|---|
| EKS | v1.31, ap-northeast-2 |
| 관리형 노드 | t3.medium On-Demand |
| Karpenter Spot | t3.medium / t3.large / t3a.medium |
| GPU Spot (추론) | g5.xlarge (Karpenter, 필요 시 프로비저닝) |
| RDS | PostgreSQL 16, db.t3.micro |
| AMP | ap-northeast-2 |
| CloudFront | pawfiler.site, www.pawfiler.site, admin.pawfiler.site |

## 보안 주의사항

**이 저장소는 공개되어 있습니다.**

절대 커밋하지 말 것:
- `terraform/terraform.tfvars`
- AWS Access Key / Secret Key
- 데이터베이스 비밀번호
- SSH 키 (`*.pem`, `*.key`)

시크릿은 AWS Secrets Manager에 저장하고 External Secrets Operator로 K8s Secret 동기화합니다.

## 관련 저장소

| 저장소 | 역할 |
|---|---|
| `pawfiler4` (이 저장소) | 애플리케이션 소스코드 + Terraform |
| `pawfiler4-argocd` | K8s 매니페스트 GitOps |
