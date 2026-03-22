# ApplicationSet Cascade Deletion 장애 분석 및 복구 기록

- **발생일시**: 2026-03-20
- **영향 범위**: pawfiler 전체 서비스 다운 (약 1시간)
- **심각도**: Critical

---

## 장애 요약

ArgoCD ApplicationSet 구조 개편 중 기존 ApplicationSet(`pawfiler-apps`, `pawfiler-infrastructure`) 삭제 시 cascade deletion이 발생하여 Karpenter NodePool/EC2NodeClass, 모든 서비스 파드, ExternalSecret 리소스까지 연쇄 삭제됨.

---

## 근본 원인

### ArgoCD ApplicationSet Cascade Deletion 동작

ArgoCD ApplicationSet은 삭제 시 기본적으로 하위 Application을 함께 삭제하며, 각 Application에 `resources-finalizer.argocd.argoproj.io`가 붙어있으면 해당 Application이 관리하는 모든 Kubernetes 리소스까지 삭제된다.

```
ApplicationSet 삭제
  └─ Application 삭제 (cascade)
       └─ Kubernetes 리소스 삭제 (finalizer)
            ├─ Karpenter NodePool
            ├─ Karpenter EC2NodeClass
            ├─ Deployment, Service (각 서비스)
            └─ ExternalSecret
```

**핵심**: `pawfiler-infrastructure` ApplicationSet이 Karpenter NodePool/EC2NodeClass를 관리하고 있었고, 이 ApplicationSet 삭제 시 NodePool/EC2NodeClass까지 삭제됨.

---

## 장애 연쇄 타임라인

| 단계 | 원인                                                           | 결과                                                     |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | `pawfiler-apps`, `pawfiler-infrastructure` ApplicationSet 삭제 | 하위 Application + 모든 리소스 cascade 삭제              |
| 2    | Karpenter NodePool/EC2NodeClass 삭제                           | 신규 노드 프로비저닝 불가 ("no nodepools found")         |
| 3    | 기존 노드 부족                                                 | external-secrets-webhook Pod Pending                     |
| 4    | external-secrets-webhook 불가용                                | ExternalSecret 생성/수정 시 admission 거부               |
| 5    | 서비스 파드 Pending/재시작                                     | 전체 서비스 다운                                         |
| 6    | ApplicationSet controller repo-server IP 캐시 stale            | 새 ApplicationSet이 서비스 Application 생성 실패         |
| 7    | `auth-credentials-external` ExternalSecret stuck terminating   | `auth-credentials` 시크릿 미생성 → auth 서비스 기동 불가 |

---

## 복구 절차

### 1단계: Karpenter NodePool/EC2NodeClass 복구

```bash
kubectl apply -f infrastructure/karpenter/nodepool.yaml
kubectl apply -f infrastructure/karpenter/ec2nodeclass.yaml
```

- Karpenter가 노드 프로비저닝 재개
- external-secrets-webhook Pod 스케줄링 → Running

### 2단계: ApplicationSet controller 재시작 (stale IP 해결)

ApplicationSet controller가 재시작된 repo-server의 구 Pod IP를 캐싱하고 있어 git 디렉토리 조회 실패.

```bash
kubectl rollout restart deployment argocd-applicationset-controller -n argocd
```

→ 재시작 후 새 ApplicationSet들이 `apps/services/*` 디렉토리를 정상 스캔하여 서비스 Application 일괄 생성

### 3단계: auth ExternalSecret stuck terminating 해결

`auth-credentials-external` ExternalSecret이 `foregroundDeletion` finalizer로 삭제 중 멈춘 상태.

```bash
kubectl patch externalsecret auth-credentials-external \
  -n pawfiler \
  -p '{"metadata":{"finalizers":[]}}' --type=merge
```

→ finalizer 제거 후 삭제 완료 → ArgoCD sync 시 재생성 → `auth-credentials` 시크릿 생성

### 4단계: pawfiler-auth Application 소유권 충돌 해결

`pawfiler-auth` Application이 삭제된 `pawfiler-apps` ApplicationSet 소유로 남아 `pawfiler-services` ApplicationSet이 재생성 불가.

- ApplicationSet controller 재시작 후 자동으로 소유권 `pawfiler-services`로 업데이트됨 (ArgoCD가 ownerReferences 수정)

---

## 복구 완료 상태

| 서비스                | 상태                                           |
| --------------------- | ---------------------------------------------- |
| auth-service          | Running ✅                                     |
| user-service          | Running ✅                                     |
| admin-service         | Running ✅                                     |
| chat-bot-service      | Running ✅                                     |
| community-service     | Running ✅                                     |
| quiz-service          | Running ✅                                     |
| kube-prometheus-stack | Synced/Progressing ✅                          |
| grafana               | Synced/Healthy ✅                              |
| loki                  | Synced/Progressing ✅                          |
| fluent-bit            | Synced/Progressing ✅                          |
| ingress (ALB)         | Synced/Healthy ✅                              |
| karpenter             | Synced/Healthy ✅                              |
| video-analysis        | CrashLoopBackOff ⚠️ (기존 버그: cv2 모듈 없음) |
| ai-orchestration      | Degraded ⚠️ (Ray GPU 노드 Pending)             |

---

## 재발 방지 조치 (적용 완료)

### 1. Karpenter ApplicationSet finalizer 제거 + prune 비활성화 ✅

`applicationset.yaml`의 `pawfiler-karpenter` ApplicationSet 템플릿에 적용됨:

```yaml
template:
  metadata:
    finalizers: []  # resources-finalizer 제거
  spec:
    syncPolicy:
      automated:
        prune: false  # 자동 prune 비활성화
      syncOptions:
        - Prune=false
```

→ ApplicationSet/Application이 삭제되어도 NodePool/EC2NodeClass는 클러스터에 유지됨

### 2. kube-prometheus-stack, external-secrets ArgoCD 관리 편입 ✅

`pawfiler-system` ApplicationSet 추가 (`applicationset.yaml`):

```yaml
# infrastructure/monitoring/ → kube-prometheus-stack
# infrastructure/external-secrets/ → external-secrets operator
# 두 디렉토리 모두 ArgoCD Application CRD를 argocd ns에 배포 (App of Apps 1 level)
```

→ 수동 `kubectl apply` / `helm install` 없이 GitOps로 완전 관리
→ ArgoCD 재설치 후에도 자동 복구됨

### 3. ApplicationSet 삭제 시 안전한 방법 (운영 규칙)

```bash
# 절대 금지: 하위 Application + 리소스 전부 삭제됨
kubectl delete applicationset <name> -n argocd

# 권장: Application은 살리고 ApplicationSet만 삭제
kubectl delete applicationset <name> -n argocd --cascade=orphan
```

---

## 핵심 교훈

> **ArgoCD ApplicationSet 삭제 = 하위 Application + 모든 K8s 리소스 삭제**
>
> Karpenter 등 핵심 인프라 리소스를 관리하는 ApplicationSet은
> `finalizers: []` + `prune: false` 설정 필수.
> ApplicationSet 구조 변경 시 반드시 `--cascade=orphan` 옵션 사용.
