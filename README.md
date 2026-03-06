# PawFiler Project

딥페이크 탐지 교육 플랫폼

## 프로젝트 구조

```
pawfiler4/
├── frontend/          # 사용자 프론트엔드 (React + TypeScript)
├── admin-frontend/    # 관리자 프론트엔드 (React + TypeScript)
├── backend/
│   ├── services/
│   │   ├── quiz/           # 퀴즈 서비스 (Go + gRPC)
│   │   ├── community/      # 커뮤니티 서비스 (Go + gRPC)
│   │   ├── admin/          # 관리자 서비스 (Go + REST)
│   │   └── video-analysis/ # 영상 분석 서비스 (Python + gRPC)
│   ├── proto/         # Protobuf 정의
│   └── envoy/         # Envoy Gateway 설정
├── terraform/         # AWS 인프라 (VPC, EKS, RDS, S3)
└── scripts/           # 배포 스크립트
```

## 빠른 시작

### 로컬 개발 (Docker Compose)

```bash
# 백엔드 서비스 실행
cd backend
docker-compose up

# 프론트엔드 실행
cd frontend
npm install && npm run dev

# 관리자 프론트엔드 실행
cd admin-frontend
npm install && npm run dev
```

### AWS 배포

```bash
# 인프라 생성
cd terraform
terraform init
terraform apply

# 백엔드 서비스 빌드 및 푸시
./scripts/build-and-push.sh

# 프론트엔드 배포 (S3)
./scripts/deploy-frontend.sh
```

## 기술 스택

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Shadcn UI
- **Backend**: Go (gRPC), Python (gRPC)
- **Database**: PostgreSQL
- **Gateway**: Envoy
- **Infrastructure**: AWS (EKS, RDS, S3, ECR)
- **IaC**: Terraform

## 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) - 프로젝트 현황
- [ENVOY_GATEWAY_SETUP.md](./ENVOY_GATEWAY_SETUP.md) - Envoy Gateway 설정
- [AWS_MIGRATION.md](./AWS_MIGRATION.md) - AWS 배포 가이드
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 배포 체크리스트
