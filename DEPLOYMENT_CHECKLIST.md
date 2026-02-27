# AWS 마이그레이션 체크리스트

## 사전 준비
- [ ] AWS 계정 및 CLI 설정 완료
- [ ] kubectl, eksctl 설치
- [ ] Docker 설치 및 실행 중
- [ ] 도메인 준비 (Route53 또는 외부)
- [ ] ACM 인증서 발급 (HTTPS용)

## 인프라 구축
- [ ] terraform/terraform.tfvars 파일 생성 및 설정
- [ ] `cd terraform && terraform apply` 실행
- [ ] RDS 엔드포인트 확인
- [ ] ECR 리포지토리 생성 확인

## 애플리케이션 배포
- [ ] `.env.production` 파일에 실제 도메인 입력
- [ ] `./scripts/build-and-push.sh` 실행 (Docker 이미지 푸시)
- [ ] Kubernetes Secrets 생성 (DB, SageMaker)
- [ ] `./scripts/deploy.sh` 실행 (K8s 배포)
- [ ] `kubectl get pods -n pawfiler` 로 Pod 상태 확인

## 프론트엔드 배포
- [ ] `npm run build:prod` 실행
- [ ] S3 버킷 생성 또는 확인
- [ ] `npm run deploy:s3` 실행
- [ ] CloudFront 배포 (선택사항)

## 검증
- [ ] ALB DNS로 API 접근 테스트
- [ ] 프론트엔드 접속 테스트
- [ ] Quiz 기능 테스트
- [ ] Community 기능 테스트
- [ ] Video Analysis 기능 테스트

## 모니터링 설정
- [ ] CloudWatch Logs 확인
- [ ] CloudWatch Alarms 설정
- [ ] X-Ray 트레이싱 설정 (선택사항)

## DNS 설정
- [ ] Route53에 도메인 등록
- [ ] ALB를 가리키는 A 레코드 생성
- [ ] api.pawfiler.com → API ALB
- [ ] pawfiler.com → Frontend ALB 또는 CloudFront

## 보안
- [ ] Security Group 규칙 검토
- [ ] IAM 권한 최소화
- [ ] Secrets Manager 사용 고려
- [ ] WAF 설정 (선택사항)

## 비용 관리
- [ ] Cost Explorer 활성화
- [ ] 예산 알림 설정
- [ ] 개발 환경 자동 중지 스케줄 설정
