# AIOps Bedrock 에이전트 구현 및 배포

> **작성일**: 2026-03-22
> **작업 범위**: DevOps Guru 제거 → AWS Bedrock 기반 자율 모니터링 에이전트 구현 및 배포 검증

---

## 성과 요약

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| 이상 감지 방식 | DevOps Guru (2~3주 학습 필요, CloudWatch만 분석) | Bedrock Claude + tool_use 루프 | 즉시 동작, AMP/CloudWatch/K8s 통합 분석 |
| 인증 방식 | API 키 관리 필요 | IRSA (IAM Roles for Service Accounts) | API 키 없이 AWS 자격증명 자동 처리 |
| 분석 주기 | DevOps Guru 자체 스케줄 | 5분 주기 자율 실행 | 실시간에 가까운 이상 감지 |
| Lambda/EventBridge | DevOps Guru 전용 Lambda + EventBridge 운영 | 제거 | 불필요한 리소스 정리 |

---

## 아키텍처

```
[스케줄러 5분마다]
    ↓
analyzer.py → Bedrock converse API 호출 (us.anthropic.claude-3-5-haiku-20241022-v1:0)
    ↓
Bedrock이 tool_use로 도구 선택
    ↓
tools.py 함수 실행:
  - get_pod_status       : K8s 파드 상태 조회
  - get_prometheus_metrics: AMP SigV4 쿼리
  - get_cloudwatch_logs  : CloudWatch Logs Insights
  - restart_deployment   : 디플로이먼트 재시작 (자동 조치)
    ↓
결과 피드백 → Bedrock 재분석 (최대 10라운드)
    ↓
이상 감지 시 SNS 알림 발송 (pawfiler-aiops 토픽)
```

**Bedrock 리전**: `us-east-1` (cross-region inference, ap-northeast-2 미지원)
**인증**: IRSA → `system:serviceaccount:monitoring:aiops` → `pawfiler-aiops` IAM Role

---

## 구현 파일

| 파일 | 역할 |
|------|------|
| `aiops/analyzer.py` | Bedrock converse API tool_use 루프 (최대 10라운드) |
| `aiops/tools.py` | AMP SigV4 쿼리, CloudWatch Logs Insights, K8s pod status, SNS 알림 |
| `aiops/main.py` | 5분 주기 스케줄러, SIGTERM/SIGINT 핸들러 |
| `aiops/requirements.txt` | boto3, botocore, kubernetes, requests, schedule |
| `aiops/Dockerfile` | python:3.12-slim, pyc 캐시 제거 (~68MB) |

### K8s 매니페스트 (pawfiler4-argocd)
| 파일 | 역할 |
|------|------|
| `infrastructure/observability/aiops/deployment.yaml` | aiops Deployment |
| `infrastructure/observability/aiops/serviceaccount.yaml` | IRSA annotation |
| `infrastructure/observability/aiops/rbac.yaml` | ClusterRole: pods/deployments get/list/watch/patch |
| `infrastructure/observability/aiops/kustomization.yaml` | Kustomize 진입점 |

---

## Terraform 변경사항

```
module.helm:
  + aws_sns_topic.aiops          (pawfiler-aiops)
  + aws_iam_role.aiops           (pawfiler-aiops)
  + aws_iam_role_policy.aiops    (Bedrock, AMP, CloudWatch, SNS 권한)
  - aws_sns_topic.devops_guru    (삭제)
  - aws_devopsguru_notification_channel.main  (삭제)
  - aws_devopsguru_resource_collection.main   (삭제)

module.ecr:
  + aws_ecr_repository.aiops     (pawfiler/aiops)
```

---

## CI/CD

`.github/workflows/ci-cd.yml`에 `build-aiops` 잡 추가:
- `aiops/**` 경로 변경 감지 (`dorny/paths-filter`)
- ECR 이미지 빌드/푸시 (`linux/amd64`)
- ArgoCD `deployment.yaml` 이미지 태그 자동 업데이트

**주의**: `aiops`는 `generate-matrix`에서 반드시 exclude 해야 함 (`backend/services/aiops` 경로 오류 방지)

---

## 배포 검증 로그 (2026-03-22)

```
aiops-5b75cb99dc-xg8c8   1/1   Running   0   67s

2026-03-22 03:05:08,651 [INFO] __main__: AIOps agent starting. Interval: 5min
2026-03-22 03:05:08,651 [INFO] analyzer: === AIOps analysis started ===
2026-03-22 03:05:12,850 [INFO] analyzer: Tool 'get_pod_status' OK
2026-03-22 03:05:14,505 [INFO] analyzer: Tool 'get_pod_status' OK
2026-03-22 03:05:17,607 [INFO] analyzer: Tool 'get_prometheus_metrics' OK
2026-03-22 03:05:21,342 [INFO] analyzer: Tool 'get_cloudwatch_logs' OK
2026-03-22 03:05:30,784 [INFO] analyzer: Analysis complete:

분석 결과:
1. 파드 상태:
   - pawfiler 네임스페이스: 총 11개 파드 중 1개(pawfiler-serve-raycluster-5tgx8-worker-gpu-workers-cds8b)가 Pending 상태
   - admin 네임스페이스: 모든 파드 정상 작동 중

2. CPU 메트릭:
   - 대부분의 파드 CPU 사용률 0.001 미만으로 정상
   - pawfiler-serve-raycluster-5tgx8-head-vzf58 파드가 0.118로 약간 높은 CPU 사용률

3. 에러 로그:
   - 최근 30분 동안 에러/패닉 로그 없음

4. 추가 관찰:
   - Pending 상태인 GPU 워커 파드 주의 필요
   - Ray 클러스터 헤드 노드 CPU 사용률 상대적으로 높음

이상 감지 여부: YES
- 파드 중 하나가 Pending 상태
- Ray 클러스터 헤드 노드 높은 CPU 사용률

권장 대응:
1. Pending 상태 파드의 이벤트/로그 확인
2. Ray 클러스터 리소스 할당 재검토

2026-03-22 03:05:30,862 [INFO] tools: SNS sent: [AIOps] pawfiler 클러스터 이상 감지
2026-03-22 03:05:30,862 [WARNING] analyzer: Anomaly detected! SNS sent.
2026-03-22 03:05:30,862 [INFO] analyzer: === AIOps analysis finished ===
```

**검증 완료**: 파드 Running → tool_use 루프 정상 → 이상 감지 → SNS 발송

---

## AMP 비용 주의사항

AMP는 **메트릭 수집량 기준 과금** (샘플 수 × 스크랩 빈도):
- Prometheus 기본 스크랩 간격: 15초 → 하루 5,760회
- 서비스/파드 수가 많을수록 폭발적으로 증가
- 단기 테스트 목적이면 AMP workspace 삭제 권장:
  ```bash
  terraform destroy -target="module.helm.aws_prometheus_workspace.main"
  ```
- remote_write만 끊어도 즉시 과금 중단 (workspace는 유지)

---

## 재현 방법 (재배포 시)

```bash
# 1. Terraform (IAM, SNS, ECR)
cd pawfiler4/terraform
terraform apply \
  -target="module.ecr.aws_ecr_repository.aiops" \
  -target="module.helm.aws_sns_topic.aiops" \
  -target="module.helm.aws_iam_role.aiops" \
  -target="module.helm.aws_iam_role_policy.aiops"

# 2. ECR 이미지 빌드 (Mac → Linux)
docker build --platform linux/amd64 -t pawfiler/aiops:latest ./aiops
# 또는 main 브랜치 푸시 → CI 자동 빌드

# 3. ArgoCD (K8s 매니페스트)
kubectl apply -f pawfiler4-argocd/infrastructure/observability/aiops/

# 4. 검증
kubectl get pods -n monitoring | grep aiops
kubectl logs -n monitoring -l app=aiops --tail=50
```
