# ArgoCD ApplicationSet Cascade Deletion 장애

- **발생일시**: 2026-03-20
- **영향 범위**: pawfiler 전체 서비스 다운 (약 1시간)
- **심각도**: Critical

---

## 한 줄 요약

ArgoCD ApplicationSet 삭제 시 하위 Application + 모든 K8s 리소스가 연쇄 삭제됨.
Karpenter NodePool/EC2NodeClass까지 삭제되어 전체 클러스터 노드 프로비저닝 불가 → 서비스 전체 다운.

---

## 원인

ArgoCD Application에 기본으로 붙는 `resources-finalizer.argocd.argoproj.io` finalizer 때문.
ApplicationSet을 삭제하면:

```
ApplicationSet 삭제
  └─ Application 삭제
       └─ Kubernetes 리소스 전부 삭제  ← finalizer 동작
            ├─ Karpenter NodePool     ← 노드 프로비저닝 불가
            ├─ Karpenter EC2NodeClass
            ├─ 각 서비스 Deployment
            └─ ExternalSecret
```

---

## 장애 연쇄

| 단계 | 이벤트                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | `pawfiler-apps`, `pawfiler-infrastructure` ApplicationSet 삭제                       |
| 2    | Karpenter NodePool/EC2NodeClass 삭제 → 신규 노드 프로비저닝 불가                     |
| 3    | 노드 부족 → `external-secrets-webhook` Pod Pending                                   |
| 4    | webhook 불가용 → ExternalSecret admission 실패                                       |
| 5    | 서비스 파드 전체 다운                                                                |
| 6    | ApplicationSet controller stale IP 캐시 → 새 Application 생성 실패                   |
| 7    | `auth-credentials-external` ExternalSecret stuck terminating → auth 서비스 기동 불가 |

---

## 복구 순서

```bash
# 1. Karpenter NodePool/EC2NodeClass 복구 (최우선)
kubectl apply -f infrastructure/karpenter/nodepool.yaml
kubectl apply -f infrastructure/karpenter/ec2nodeclass.yaml
# → Karpenter 노드 프로비저닝 재개 → external-secrets-webhook Running

# 2. ApplicationSet controller 재시작 (stale IP 해결)
kubectl rollout restart deployment argocd-applicationset-controller -n argocd
# → 서비스 Application 일괄 재생성

# 3. stuck terminating ExternalSecret finalizer 제거
kubectl patch externalsecret auth-credentials-external \
  -n pawfiler \
  -p '{"metadata":{"finalizers":[]}}' --type=merge
# → ArgoCD sync 시 재생성 → auth-credentials 시크릿 생성
```

---

## 재발 방지 (적용 완료)

### Karpenter ApplicationSet finalizer 제거

`applicationset.yaml`의 `pawfiler-karpenter`에 적용:

```yaml
template:
  metadata:
    finalizers: [] # Application 삭제 시 NodePool 보호
  spec:
    syncPolicy:
      automated:
        prune: false # 자동 prune 비활성화
      syncOptions:
        - Prune=false
```

### ApplicationSet 구조 변경 시 안전한 삭제

```bash
# 항상 --cascade=orphan 사용
kubectl delete applicationset <name> -n argocd --cascade=orphan
```

### 시스템 컴포넌트 ArgoCD 관리 편입

- `pawfiler-system` ApplicationSet 추가
  - `infrastructure/monitoring/` → kube-prometheus-stack (Helm)
  - `infrastructure/external-secrets/` → external-secrets operator (Helm)
- 수동 `helm install` 없이 GitOps로 관리 → ArgoCD 재설치 시 자동 복구

---

## 관련 파일

- `pawfiler4-argocd/applicationset.yaml` - ApplicationSet 구조
- `pawfiler4-argocd/infrastructure/karpenter/` - NodePool, EC2NodeClass
- `pawfiler4-argocd/infrastructure/external-secrets/` - external-secrets operator
- `pawfiler4-argocd/infrastructure/monitoring/` - kube-prometheus-stack
