# 배포 가이드

## 방법 1: 간단한 배포 (권장)

```bash
# 개발 환경 (HPA 적용, 트래픽 없으면 0)
./deploy.sh
# HPA 적용? y 입력

# 프로덕션 (항상 최소 1개 유지)
./deploy.sh
# HPA 적용? n 입력
```

## 방법 2: Kustomize 사용

```bash
# 개발 환경
kubectl apply -k overlays/dev/

# 프로덕션 환경
kubectl apply -k overlays/prod/
```

## 방법 3: ArgoCD 사용

### ArgoCD Application 생성

```yaml
# argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: pawfiler-ai
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/pawfiler4
    targetRevision: main
    path: backend/services/ai-orchestration/overlays/dev  # 또는 prod
  destination:
    server: https://kubernetes.default.svc
    namespace: pawfiler
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

```bash
kubectl apply -f argocd-app.yaml
```

## 환경별 차이

| 항목 | 개발 (dev) | 프로덕션 (prod) |
|------|-----------|----------------|
| 초기 Worker | 0개 | 1개 |
| HPA | 적용 (0~2) | 미적용 (1~2) |
| 비용 | $0~467/월 | $248~467/월 |
| Cold Start | 첫 요청 시 ~2분 | 즉시 응답 |

## 수동 스케일 조정

```bash
# 즉시 종료 (비용 절감)
kubectl scale rayservice pawfiler-serve --replicas=0 -n pawfiler

# 다시 시작
kubectl scale rayservice pawfiler-serve --replicas=1 -n pawfiler
```

## 비용 절감 팁

1. **개발 시**: HPA 적용, 퇴근 시 수동 종료
2. **프로덕션**: HPA 미적용, 항상 1개 유지
3. **야간/주말**: Cronjob으로 자동 종료/시작

```yaml
# cronjob-scale-down.yaml (야간 종료)
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pawfiler-scale-down
  namespace: pawfiler
spec:
  schedule: "0 22 * * *"  # 매일 22시
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: pawfiler-scaler
          containers:
          - name: kubectl
            image: bitnami/kubectl:latest
            command:
            - kubectl
            - scale
            - rayservice
            - pawfiler-serve
            - --replicas=0
          restartPolicy: OnFailure
```
