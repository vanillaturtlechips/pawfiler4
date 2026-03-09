# PawFiler 프로젝트 현황

마지막 업데이트: 2026-03-09

## 전체 진행 상황

### 백엔드 서비스

| 서비스 | 상태 | 완성도 | 비고 |
|--------|------|--------|------|
| Quiz Service | ✅ 완료 | 95% | gRPC, PostgreSQL, 보안 이슈 수정 필요 |
| Community Service | ✅ 완료 | 90% | gRPC, PostgreSQL, 리팩토링 권장 |
| Admin Service | ✅ 완료 | 100% | REST API, S3 IRSA |
| Video Analysis | ⚠️ 부분 | 70% | gRPC 구현, 프론트 연동 필요 |
| Auth Service | ❌ 미구현 | 0% | 스키마만 준비 |
| Payment Service | ❌ 미구현 | 0% | 스키마만 준비 |

### 프론트엔드

| 항목 | 상태 | 완성도 |
|------|------|--------|
| 사용자 프론트엔드 | ✅ 완료 | 95% |
| 관리자 프론트엔드 | ✅ 완료 | 100% |

### 인프라

| 항목 | 상태 | 비고 |
|------|------|------|
| Terraform | ✅ 완료 | VPC, EKS, RDS, ECR, S3, CloudFront |
| EKS (v1.31) | ✅ 배포됨 | Spot + On-Demand 노드 |
| RDS (PostgreSQL 16.3) | ✅ 배포됨 | db.t3.micro |
| ECR | ✅ 완료 | Lifecycle Policy (5개 유지) |
| S3 + CloudFront | ✅ 완료 | 정적 호스팅 + API Origin |
| Helm 차트 | ✅ 완료 | ALB Controller, ArgoCD, Kubecost, Grafana |
| k8s 매니페스트 | ✅ 완료 | 순수 YAML + Helm 차트 |

### ML 파이프라인

| 항목 | 상태 | 비고 |
|------|------|------|
| Cascade 구조 | ✅ 완료 | 3단계 (비용 69% 절감) |
| MobileViT v2 | ✅ 완료 | 영상 분석 (Tier 1) |
| faster-whisper | ✅ 완료 | 음성 분석 (Tier 2) |
| Nova 2 Lite | ✅ 완료 | LLM 판단 (Tier 3) |
| 음성 딥페이크 | ✅ 완료 | Colab 무료 학습 |
| SageMaker 배포 | ✅ 완료 | Auto-scaling, Spot 학습 |

---

## 최근 변경사항 (2026-03-09)

### 문서 통합 및 정리
- ✅ `docs/DEPLOYMENT.md` 생성 (배포 가이드 통합)
- ✅ `docs/DEVELOPMENT.md` 생성 (개발 가이드 통합)
- ✅ README.md 최신화
- ✅ 불필요한 MD 파일 6개 삭제 예정

### Terraform 정리
- ✅ ECR Lifecycle Policy 추가 (최근 5개 이미지만 유지)
- ✅ `terraform.tfvars` 생성 (현재 배포 상태 기반)
- ✅ 모듈화 작업 보류 (팀원 담당)

### Admin 프론트엔드 수정 (2026-03-08)
- ✅ 커뮤니티 관리 API 엔드포인트 수정 (gRPC → BFF)
- ✅ 403 에러 해결 (원작성자 userId 전달)
- ✅ `.env.example` 추가

---

## 현재 이슈

### 🚨 Critical
1. **Quiz Handler 보안**: 정답을 explanation에 숨겨서 보내는 방식 개선 필요
2. **Video Analysis 프론트 연동**: Mock API → 실제 gRPC 연동 필요

### ⚠️ Important
1. **Community Service 검색 최적화**: ILIKE → Full-text search 또는 GIN 인덱스
2. **테스트 부족**: 대부분 서비스에 테스트 코드 없음 (20%)
3. **gRPC Health Check**: 모든 gRPC 서비스에 추가 필요

### 💡 Enhancement
1. **Redis 캐싱**: 퀴즈 문제, 사용자 통계 캐싱
2. **Rate Limiting**: API 호출 제한
3. **CI/CD 개선**: GitHub Actions 자동화 강화
4. **모니터링**: 로깅, 메트릭, 트레이싱 시스템 추가

---

## 다음 단계

### 우선순위 1: 보안 및 안정성
- [ ] Quiz Handler 정답 노출 방식 수정
- [ ] gRPC Health Check 추가
- [ ] 에러 로깅 개선

### 우선순위 2: 핵심 기능 완성
- [ ] Video Analysis 프론트엔드 연동
- [ ] Auth Service 구현 (JWT)
- [ ] Payment Service 구현

### 우선순위 3: 품질 개선
- [ ] 테스트 코드 작성 (목표: 80%)
- [ ] Community Service 검색 최적화
- [ ] Redis 캐싱 추가

### 우선순위 4: 운영 개선
- [ ] 모니터링 시스템 강화
- [ ] CI/CD 파이프라인 개선
- [ ] 문서 자동화

---

## 비용 현황

### 월 예상 비용 (ap-northeast-2)
| 리소스 | 비용 |
|--------|------|
| EKS Cluster | $133 |
| RDS (db.t3.micro) | $15 |
| NAT Gateway | $32 |
| Bastion (t3.micro) | $8 |
| EKS 노드 (t3.medium x2) | ~$50 |
| ML 파이프라인 (100k req/월) | ~$56 |
| **합계** | **~$294/월** |

### 비용 절감 현황
- ✅ Spot 인스턴스 사용 (70% 절감)
- ✅ ECR Lifecycle Policy (스토리지 절감)
- ✅ ML Cascade 구조 (69% 절감)
- ✅ 음성 딥페이크 Colab 학습 ($0)
- ✅ EKS/Bastion 중지 스크립트

---

## 팀 작업 분담

### 진행 중
- **모듈화**: 팀원 담당 (Terraform 모듈 구조 개선)

### 완료
- **문서 정리**: 완료 (2026-03-09)
- **Admin 프론트 수정**: 완료 (2026-03-08)
- **ECR Lifecycle**: 완료 (2026-03-09)

---

## 참고 문서

### 필수
- [README.md](./README.md) - 프로젝트 개요
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - 배포 가이드
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) - 개발 가이드

### 상세
- [terraform/README.md](./terraform/README.md) - Terraform 가이드
- [k8s/README.md](./k8s/README.md) - Kubernetes 가이드
- [backend/services/quiz/README.md](./backend/services/quiz/README.md) - Quiz Service

---

## 전체 완성도

**약 75%** (핵심 기능 완료, 품질 개선 필요)

- 백엔드: 70% (4/6 서비스 완료)
- 프론트엔드: 97% (거의 완료)
- 인프라: 100% (완료)
- ML 파이프라인: 100% (완료)
- 테스트: 20% (부족)
- 문서: 95% (최신화 완료)
