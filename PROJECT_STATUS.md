# PawFiler 프로젝트 현황

마지막 업데이트: 2026-03-06

## 전체 진행 상황

### 백엔드 서비스

| 서비스 | 상태 | 비고 |
|--------|------|------|
| Quiz Service | ✅ 완료 | gRPC, PostgreSQL 연동 |
| Community Service | ✅ 완료 | gRPC, PostgreSQL 연동 |
| Admin Service | ✅ 완료 | REST API, S3 업로드 |
| Video Analysis | ⚠️ 부분 | gRPC 구현, 프론트 Mock |
| Auth Service | ❌ 미구현 | 스키마만 준비 |
| Payment Service | ❌ 미구현 | 스키마만 준비 |

### 프론트엔드

| 항목 | 상태 |
|------|------|
| 사용자 프론트엔드 | ✅ 완료 |
| 관리자 프론트엔드 | ✅ 완료 |

### 인프라

| 항목 | 상태 |
|------|------|
| Terraform (VPC, RDS, S3) | ✅ 완료 |
| S3 정적 호스팅 | ✅ 완료 |
| ECR | ✅ 완료 |
| EKS | ⚠️ 비용 절감을 위해 삭제 가능 |
| Envoy Gateway | ⚠️ 로컬 설정 완료, K8s 설정 필요 |

## 최근 변경사항 (2026-03-06)

### BFF 제거 및 Envoy Gateway 전환
- ✅ BFF ECR 제거
- ✅ 배포 스크립트에서 BFF 제거
- ✅ 프론트엔드 API 엔드포인트 변경 (BFF → Envoy)
- ✅ 로컬 Envoy 컨테이너 설정 추가
- ⏳ K8s Gateway API 매니페스트 작성 필요 (ArgoCD 레포)

### 불필요한 문서 정리
- ✅ BFF_VS_ENVOY_TRANSCODING.md 삭제
- ✅ GATEWAY_VS_INGRESS.md 삭제
- ✅ HELM_ARGOCD_KUBECOST.md 삭제
- ✅ VALIDATION_REPORT.md 삭제

## 다음 단계

### 우선순위 1: Envoy Gateway 완성
- [ ] K8s Gateway API 매니페스트 작성
- [ ] 로컬 Envoy 설정 테스트
- [ ] 프로덕션 Envoy 배포

### 우선순위 2: 보안 및 안정성
- [ ] Quiz Handler 정답 노출 방식 수정
- [ ] gRPC Health Check 추가
- [ ] 에러 로깅 개선

### 우선순위 3: 핵심 기능 완성
- [ ] Video Analysis 프론트엔드 연동
- [ ] Auth Service 구현
- [ ] 테스트 코드 작성

## 참고 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [ENVOY_GATEWAY_SETUP.md](./ENVOY_GATEWAY_SETUP.md) - Envoy Gateway 설정
- [AWS_MIGRATION.md](./AWS_MIGRATION.md) - AWS 배포 가이드
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 배포 체크리스트
