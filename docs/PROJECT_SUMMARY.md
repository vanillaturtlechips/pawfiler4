# PawFiler 프로젝트 종합 요약

## 1. 프로젝트 개요

**PawFiler**는 딥페이크 탐지 능력을 키우는 게임형 교육 플랫폼이다.
사용자는 퀴즈를 통해 딥페이크 영상을 구별하는 능력을 훈련하고, 커뮤니티에서 사례를 공유하며, 실제 영상을 업로드해 AI 분석을 받을 수 있다.

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS + Shadcn UI + Framer Motion |
| **Backend** | Go 1.21 (auth/user/quiz/community/admin), Python 3.11 (video-analysis/chat-bot/ai-orchestration/report) |
| **API Protocol** | gRPC-Web (브라우저→서버), gRPC (서비스 간), REST (일부) |
| **Database** | PostgreSQL 16.3 (RDS) + Redis (EKS 인메모리) |
| **컨테이너 오케스트레이션** | EKS 1.31 + Karpenter (Spot 자동 스케일링) |
| **서비스 메시** | Istio (Gateway + VirtualService + mTLS + JWT AuthZ) |
| **IaC** | Terraform + Helm |
| **GitOps** | ArgoCD + ApplicationSet (selfHeal + prune) |
| **CI/CD** | GitHub Actions (경로 필터 + 매트릭스 병렬 빌드) |
| **Observability** | Prometheus + Grafana + Loki + Tempo + OTel Collector + AWS X-Ray |
| **AI/ML** | AWS SageMaker + AWS Bedrock (Claude Haiku) + Ray Serve (Cascade) |
| **인증** | AWS Cognito (User Pool + JWT) |
| **Secrets** | AWS Parameter Store + External Secrets Operator |
| **CDN** | CloudFront (S3 정적 파일 + 미디어) |

---

## 3. 서비스 구성

### 3-1. 백엔드 서비스

| 서비스 | 언어 | 포트 | 역할 |
|--------|------|------|------|
| **auth-service** | Go | HTTP 8084 | Cognito 연동 회원가입/로그인/토큰 발급 |
| **user-service** | Go | HTTP 8083 / gRPC 50054 | 사용자 프로필, 통계, 랭킹 |
| **quiz-service** | Go | HTTP 8080 / gRPC 50052 | 딥페이크 탐지 퀴즈, 문제 관리 |
| **community-service** | Go | HTTP 8080 / gRPC 50053 | 커뮤니티 게시판, 댓글, 투표, 좋아요 |
| **video-analysis** | Python | HTTP 8080 / gRPC 50054 | 영상 업로드 + ML 파이프라인 호출 |
| **chat-bot-service** | Python | HTTP 8088 | AWS Bedrock Claude 기반 AI 챗봇 |
| **admin-service** | Go | HTTP 8082 | 관리자 대시보드 (퀴즈/커뮤니티/유저 관리) |
| **ai-orchestration** | Python | Ray Serve | 딥페이크 탐지 Cascade ML 파이프라인 |
| **report-service** | Python | Lambda | EDA 방식 PDF 리포트 생성 (SQS 트리거) |
| **aiops** | Python | HTTP 8090 | Bedrock 기반 자동 이상 감지 및 복구 에이전트 |

### 3-2. 프론트엔드

| 앱 | 프레임워크 | 배포 | 역할 |
|----|----------|------|------|
| **사용자 FE** (`/frontend`) | React 18 + Vite | S3 + CloudFront (`pawfiler.site`) | 게임, 퀴즈, 커뮤니티, 분석 |
| **어드민 FE** (`/admin-frontend`) | React 18 + Vite | S3 + NLB (별도 ALB) | 관리자 전용 대시보드 |

**사용자 FE 주요 페이지**:
- `LoginPage` — 회원가입/로그인 (Cognito)
- `HomePage` — 메인 대시보드, 일일 도전, 상점
- `GamePage` — 퀴즈 게임 (선택 → 문제 → 결과)
- `AnalysisPage` — 영상 딥페이크 분석 업로드
- `CommunityPage` / `CommunityPostPage` — 커뮤니티 피드, 게시물 상세
- `ProfilePage` — 사용자 통계, 레벨, 티어
- `RankingPage` — 글로벌 랭킹

---

## 4. AWS 인프라

### 4-1. 네트워킹

- **VPC**: 10.0.0.0/16 (ap-northeast-2)
- **Public Subnet**: ALB, Bastion, NAT GW
- **Private Subnet**: EKS 노드, RDS, RDS Proxy

### 4-2. 컴퓨트 (EKS)

| 리소스 | 사양 | 역할 |
|--------|------|------|
| EKS Cluster | v1.31 | Kubernetes 컨트롤 플레인 |
| 관리형 노드그룹 | t3.medium × 1 (Spot) | 기본 시스템 파드 베이스 |
| Karpenter 노드 | t3.medium~large (Spot) | 워크로드 자동 스케일링 |

### 4-3. 데이터 레이어

| 서비스 | 사양 | 역할 |
|--------|------|------|
| RDS PostgreSQL | db.t3.micro, v16.3 | 주 데이터베이스 |
| RDS Proxy | | 커넥션 풀링 |
| Redis | EKS 파드 (emptyDir) | 세션/캐시 (재시작 시 초기화) |

### 4-4. 스토리지 (S3)

| 버킷 | 역할 |
|------|------|
| `pawfiler-frontend` | 사용자 FE 정적 파일 |
| `pawfiler-admin-frontend` | 어드민 FE 정적 파일 |
| `pawfiler-quiz-media` | 퀴즈 문제 미디어 (영상/이미지) |
| `pawfiler-community-media` | 커뮤니티 게시물 미디어 |
| `pawfiler-loki-chunks` | Loki 로그 장기 저장 |
| `pawfiler-reports` | PDF 리포트 임시 저장 (1일 lifecycle) |
| `pawfiler-videos` | 사용자 업로드 영상 |

### 4-5. AI/ML 서비스

| 서비스 | 역할 | 모델 |
|--------|------|------|
| AWS SageMaker | 딥페이크 탐지 Tier 1 | MobileViT v2 (파인튜닝) |
| AWS Bedrock | AI 챗봇 + AIOps 분석 | Claude Haiku (us-east-1) |
| Ray Serve | Cascade 오케스트레이션 | Tier 2: faster-whisper / Tier 3: Nova 2 Lite |

**Cascade 구조**:
```
Tier 1 (SageMaker MobileViT) → 69% 처리 (비용 최소화)
Tier 2 (Whisper)             → 24% 처리 (음성 분석)
Tier 3 (Nova 2 Lite)         → 7% 처리 (복잡한 케이스)
```

### 4-6. 기타 AWS 서비스

| 서비스 | 역할 |
|--------|------|
| Cognito User Pool | 사용자 인증 (auth-service 연동) |
| Parameter Store | 시크릿 저장 (`/pawfiler/*`) |
| Lambda | report-service 실행 환경 |
| SQS | 리포트 생성 비동기 큐 |
| API Gateway | Lambda HTTP 엔드포인트 |
| SNS | AIOps 알림 |
| CloudFront | 프론트엔드 + 미디어 CDN |
| Route53 | DNS (`api.pawfiler.site`, `pawfiler.site`) |
| ACM | TLS 인증서 |

---

## 5. 트래픽 흐름

```
[브라우저]
  ↓ HTTPS
[CloudFront] → S3 (정적 FE)
  ↓ /api/*
[ALB] (k8s-istioing-*)
  ↓ HTTP
[Istio IngressGateway] (NLB)
  ↓
[Istio VirtualService] (경로 기반 라우팅)
  ↓
[각 서비스 파드] (Istio 사이드카 + mTLS)

[어드민]
[ALB] (k8s-pawfileradmin-*) → admin-service, aiops
```

---

## 6. Istio 설정

**위치**: `pawfiler4-argocd/infrastructure/istio/`

| 파일 | 역할 |
|------|------|
| `gateway.yaml` | NLB 뒤에서 HTTP(80) 수신, `*.pawfiler.site` 호스트 |
| `virtualservice.yaml` | 경로별 서비스 라우팅 (/api/auth, /api/quiz.* 등) |
| `request-authentication.yaml` | Cognito JWT 검증 |
| `authorization-policy.yaml` | JWT 없는 요청 DENY (auth 엔드포인트 제외) |
| `peer-authentication.yaml` | 서비스 간 mTLS |

**VirtualService 라우팅**:
```
/api/quiz.QuizService        → quiz-service:8080
/api/community.Community*    → community-service:8080
/api/analysis, /api/keys     → video-analysis:8080
/api/user.UserService        → user-service:8083
/api/auth                    → auth-service:8084
/api/chat                    → chat-bot-service:8088
```

---

## 7. CI/CD 파이프라인

**파일**: `.github/workflows/ci-cd.yml`

### 흐름

```
push to main
  ↓
[1] detect-changes
    변경된 서비스 감지 (경로 필터)
  ↓
[2~7] 병렬 실행
    build-and-push   → ECR 이미지 빌드 & 푸시 (sha 태그)
    update-argocd    → ArgoCD repo deployment.yaml 이미지 태그 업데이트
    deploy-frontend  → S3 sync + CloudFront invalidation
    deploy-admin     → S3 sync
    deploy-report    → Lambda 코드 업데이트
    build-aiops      → ECR 푸시 + ArgoCD 태그 업데이트
```

### 특이사항
- 서비스별 독립 빌드 (변경된 서비스만 빌드)
- ArgoCD repo 자동 커밋으로 GitOps 연동
- `VITE_USE_MOCK_AUTH=false`, `VITE_USE_MOCK_API=false` (프로덕션 강제)

---

## 8. ArgoCD 구성

**레포**: `pawfiler4-argocd`

| ApplicationSet | 소스 경로 | Namespace | 특이사항 |
|---------------|----------|-----------|---------|
| `pawfiler-services` | `apps/base`, `apps/services/*` | pawfiler | admin 제외, selfHeal+prune |
| `pawfiler-admin` | `apps/services/admin` | admin | 격리된 namespace |
| `pawfiler-istio` | `infrastructure/istio` | istio-system | |
| `pawfiler-ingress` | `infrastructure/ingress` | pawfiler | ALB Ingress |
| `pawfiler-karpenter` | `infrastructure/karpenter` | karpenter | prune=false (NodePool 보호) |
| `pawfiler-monitoring` | `infrastructure/observability/loki,grafana,aiops,tempo` | monitoring | |
| `pawfiler-system` | `infrastructure/observability/prometheus,otel-collector,external-secrets` | argocd | ServerSideApply |

> `applicationset.yaml`은 ArgoCD 설치 후 수동으로 `kubectl apply` 필요

---

## 9. 데이터베이스 스키마

**파일**: `backend/scripts/init-db.sql`

| 스키마 | 테이블 | 주요 컬럼 |
|--------|--------|----------|
| `auth` | `users` | id(UUID), email, password_hash, nickname, avatar_emoji |
| `quiz` | `questions` | id, type, media_url, difficulty, correct_index |
| `quiz` | `user_answers` | user_id, question_id, is_correct, xp_earned |
| `quiz` | `user_stats` | user_id, total_answered, correct_count, current_streak |
| `quiz` | `user_profiles` | user_id, nickname, total_exp, current_tier, energy |
| `community` | `posts` | id, author_id, title, body, likes, true_votes, false_votes |
| `community` | `comments` | id, post_id, author_id, content |
| `community` | `likes` | post_id, user_id (UNIQUE) |
| `community` | `media_uploads` | id, media_url, linked |
| `video_analysis` | `tasks` | id, user_id, video_url, status |
| `video_analysis` | `results` | task_id, verdict, confidence_score, manipulated_regions |

---

## 10. Observability 스택

**모든 컴포넌트 기본 replicas=0 (비용 절감, 필요 시 수동 활성화)**

| 도구 | 역할 | 백엔드 |
|------|------|--------|
| **Prometheus** | 메트릭 수집 | AWS AMP (장기 저장) |
| **Grafana** | 메트릭/로그/트레이스 시각화 | Prometheus + Loki + Tempo |
| **Loki** | 로그 집계 | S3 (pawfiler-loki-chunks) |
| **Tempo** | 분산 트레이싱 | OTLP 수신 (포트 4317) |
| **OTel Collector** | 사이드카 트레이스/로그 수집 → Loki/Tempo/X-Ray 전달 | |
| **AIOps Agent** | Bedrock Claude 기반 자동 이상 감지/복구 + SNS/Slack 알림 | |

---

## 11. Terraform 모듈

**위치**: `terraform/modules/`

| 모듈 | 역할 |
|------|------|
| `networking` | VPC, Subnet, IGW, NAT GW, Route Table |
| `iam` | EKS Cluster/Node IAM Role |
| `eks` | EKS Cluster, Node Group, VPC CNI/EBS CSI 애드온 |
| `bastion` | Bastion EC2 (t3.micro) |
| `rds` | PostgreSQL 16.3, RDS Proxy |
| `s3` | S3 버킷 7개 + CloudFront |
| `ecr` | ECR 레포지토리 (서비스별) |
| `helm` | ALB Controller, ArgoCD, Karpenter, External Secrets, Metrics Server |
| `irsa` | 서비스별 IRSA (auth-Cognito, admin-S3, loki-S3 등) |
| `karpenter` | Karpenter IAM, SQS, EventBridge |
| `cognito` | Cognito User Pool + Client |
| `lambda_report` | Lambda, SQS, API Gateway, S3 리포트 버킷 |

**State 저장**: S3 `pawfiler-terraform-state` + DynamoDB 락
**주요 변수**: `enable_istio=true`, `enable_karpenter=true`

---

## 12. 인증 흐름 (Cognito)

```
[프론트엔드]
  POST /api/auth/signup { email, password }
  POST /api/auth/login  { email, password }
      ↓
[auth-service] (IRSA로 Cognito 호출 권한)
  AdminCreateUser → AdminSetUserPassword → InitiateAuth
      ↓
  AccessToken + RefreshToken 반환
      ↓
[프론트엔드] Authorization: Bearer {AccessToken}
      ↓
[Istio RequestAuthentication] JWT 서명 검증 (Cognito JWKS)
      ↓
[Istio AuthorizationPolicy] 미인증 요청 DENY
      ↓
[각 서비스] x-user-id 헤더로 사용자 식별 (Istio 주입)
```

---

## 13. 클러스터 종료/재구축 절차

### 종료 순서 (비용 절감 시)

```bash
# 1. Karpenter 노드 정리
kubectl delete nodepool --all

# 2. ArgoCD ApplicationSet 삭제 (ALB/NLB 정리)
kubectl delete applicationset --all -n argocd

# 3. EKS + Helm 삭제
terraform destroy -target=module.helm -target=module.irsa -target=module.karpenter -auto-approve
aws eks delete-cluster --name pawfiler-eks-cluster
terraform state rm module.eks.*  # state 동기화

# 4. NAT GW 삭제
terraform destroy -target=module.networking.aws_nat_gateway.main -auto-approve
```

### 재구축 순서

```bash
# 1. Terraform apply
terraform apply -auto-approve

# 2. ArgoCD 수동 부트스트랩 (최초 1회)
kubectl apply -f cluster-secret-store.yaml
kubectl apply -f argocd-repo-external-secret.yaml
kubectl apply -f applicationset.yaml
# → 이후 ArgoCD가 모든 서비스 자동 배포
```

---

## 14. 월 예상 비용

| 항목 | 비용/월 |
|------|---------|
| EKS 컨트롤 플레인 | ~$72 |
| EC2 노드 (t3.medium + Spot) | ~$60 |
| RDS (db.t3.micro) | ~$15 |
| NAT Gateway | ~$32 |
| Bastion (t3.micro) | ~$8 |
| S3, ECR, CloudFront | ~$5 |
| Cognito, SQS, Lambda | ~$3 |
| **합계** | **~$195/월** |

> EKS + NAT GW 종료 시: ~$31/월 (RDS + Bastion + S3)

---

## 15. 팀 구성

| GitHub ID | 역할 |
|-----------|------|
| **Nokzzi (MunJaeYoon)** | 인프라(EKS/Istio/Terraform), 인증(Cognito), 버그 수정 |
| **khsik6163 (hansik)** | community-service, Redis 최적화, Kubecost |
| **Jaewon** | community-service 성능 개선, S3 파일 관리, CI/CD |
| **이명일 (myong)** | AI/ML 파이프라인, 파인튜닝 모델 |
| **Peaceday** | PR 리뷰/머지 |
| **junghan** | 기타 |
