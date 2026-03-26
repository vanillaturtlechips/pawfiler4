# EKS 클러스터 최적화 트러블슈팅

> **문서 작성 원칙**: 이 문서는 반드시 **성과 중심**으로 작성한다.
> 트러블슈팅 내용을 추가할 때는 항상 상단 "성과 요약" 테이블을 먼저 업데이트할 것.
> Before / After / 효과(수치) 세 컬럼을 모두 채워야 한다.
> 각 트러블슈팅 항목에는 반드시 **재현 방법**을 포함할 것. 같은 문제를 다시 만났을 때 확인 절차 없이 처음부터 디버깅하는 일이 없어야 한다.

## 성과 요약

> 서울 리전(ap-northeast-2) 온디맨드 기준: t3.medium $0.042/h, t3.large $0.083/h, g5.xlarge $1.006/h

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| 노드 수 | 7개 | 5개 | node-group-spot t3.medium x2 제거, **월 ~$60 절감** |
| Cluster Autoscaler IAM | 고아 Role/Policy 잔존 | 완전 제거 | 불필요한 권한 제거, 보안 surface 축소 |
| 오토스케일러 이중화 | Karpenter + managed node group spot 동시 운영 | Karpenter 단일 관리 | 스케일링 충돌 제거, 운영 복잡도 감소 |
| nvidia-device-plugin | 전체 노드 5개에 배포 (GPU 없는 노드 포함) | GPU 노드 1개로 한정 | 노드당 파드 슬롯 1개 회수 x4 노드 |
| pawfiler-base ArgoCD | Degraded (ExternalSecret 동기화 실패) | Synced/Healthy | ArgoCD 부트스트랩 의존성 구조 문제 해결 |
| 노드당 최대 파드 수 | t3.medium 17개 한도 (DaemonSet Pending) | VPC CNI Prefix Delegation으로 110개 | 비용 유지하면서 파드 밀도 6배 향상 |

---

## 1. Terraform ignore_changes로 인한 Karpenter + managed node group 중복 운영

**재현 방법**
```bash
kubectl get nodes -L "eks.amazonaws.com/nodegroup" -L "karpenter.sh/nodepool"
# nodegroup과 nodepool 둘 다 spot 노드가 존재하면 중복 운영 중
```

**증상**

Karpenter 도입 후에도 클러스터에 노드가 7개로 과잉 운영됐다. spot 노드만 4개였다.

```
node-group-spot (managed)  : 2개 (t3.medium)
Karpenter spot NodePool    : 2개 (t3.medium, t3a.large)
node-group-ondemand        : 2개
node-group-gpu             : 1개
```

**원인**

Karpenter 전환 시 managed node group의 `desired_size`를 0으로 설정했으나, 테라폼 코드에 `ignore_changes = [scaling_config[0].desired_size]`가 선언돼 있어 실제 클러스터에 반영되지 않았다.

이는 테라폼에서 EKS node group을 관리할 때 흔히 발생하는 함정이다. 클러스터 오토스케일러나 Karpenter가 `desired_size`를 런타임에 변경하기 때문에 `ignore_changes`를 걸어두는 패턴이 일반적인데, 이 설정이 의도적인 `desired_size=0` 변경도 막아버린다.

**해결**

AWS CLI로 managed node group 직접 삭제 후 테라폼 state 및 코드에서 제거:

```bash
aws eks delete-nodegroup \
  --cluster-name pawfiler-eks-cluster \
  --nodegroup-name pawfiler-node-group-spot \
  --region ap-northeast-2

terraform state rm "module.eks.aws_eks_node_group.spot"
```

Karpenter가 자동으로 새 spot 노드를 프로비저닝하며 파드 재스케줄링 완료.

---

## 2. Karpenter 전환 후 Cluster Autoscaler IAM 고아 리소스

**재현 방법**
```bash
aws iam list-roles --query "Roles[?contains(RoleName, 'autoscaler')]"
terraform plan  # 코드에 리소스 블록이 남아있으면 drift 감지
```

**증상**

Karpenter 전환 이후 Cluster Autoscaler Helm release는 주석처리됐으나, IAM Role/Policy(`pawfiler-cluster-autoscaler`)가 AWS에 잔존했다. 테라폼 코드에도 리소스 블록이 유지된 상태였다.

**원인**

Helm 기반 애플리케이션을 비활성화할 때 Helm release만 주석처리하면 쿠버네티스 리소스는 정리되지만, Helm 외부에서 테라폼으로 별도 생성한 IAM 리소스는 자동으로 정리되지 않는다. Helm과 테라폼이 각각 다른 리소스를 관리하는 구조에서 발생하는 전형적인 문제다.

**해결**

```bash
terraform destroy \
  -target="module.helm.aws_iam_role_policy.cluster_autoscaler" \
  -target="module.helm.aws_iam_role.cluster_autoscaler" \
  -refresh=false
```

테라폼 코드 및 outputs.tf에서 관련 블록 제거.

---

## 3. nvidia-device-plugin nodeSelector 미설정으로 전체 노드 배포

**재현 방법**
```bash
kubectl get pods -n kube-system -l name=nvidia-device-plugin-ds -o wide
# GPU 없는 노드에도 파드가 뜨면 nodeSelector 미설정 상태
kubectl describe daemonset nvidia-device-plugin-daemonset -n kube-system | grep -A3 "Node-Selector"
```

**증상**

`nvidia-device-plugin-daemonset`이 GPU가 없는 노드 포함 전체 노드에 배포돼 파드 슬롯을 낭비했다. 결과적으로 DaemonSet 파드(fluent-bit, node-exporter, otel-collector)가 "Too many pods" 오류로 Pending 상태가 됐다.

**원인**

nvidia-device-plugin Helm chart의 기본값에는 `nodeSelector`가 없다. GPU 전용 NodePool에 taint를 걸어도 DaemonSet은 기본적으로 모든 taint를 tolerate하도록 설계되어 있어, 별도로 `nodeSelector`를 지정하지 않으면 전체 노드에 배포된다.

GPU taint + DaemonSet toleration 동작 방식을 이해하지 못하면 누구나 빠지는 함정이다.

**해결**

```bash
kubectl patch daemonset nvidia-device-plugin-daemonset -n kube-system \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"karpenter.sh/nodepool":"gpu"}}}}}'
```

GPU NodePool 노드 1개에만 배포되도록 제한.

---

## 현재 클러스터 구성

| 노드 | 타입 | 관리 주체 | 용도 |
|------|------|---------|------|
| node-group-ondemand x2 | t3.medium ON_DEMAND | Managed Node Group | 안정적인 시스템 파드 |
| Karpenter spot x3 | t3.medium / t3.large | Karpenter | 일반 워크로드 |
| node-group-gpu x1 | g5.xlarge SPOT | Managed Node Group | AI/GPU 워크로드 |

---

## 4. ArgoCD 부트스트랩 순환 의존성 - ClusterSecretStore not found

**재현 방법**
```bash
kubectl get application -n argocd pawfiler-base
# Degraded 확인
kubectl get externalsecret -n pawfiler
# SecretSyncedError 확인
kubectl describe externalsecret db-credentials-external -n pawfiler | grep "ClusterSecretStore"
```

**증상**

`pawfiler-base` ArgoCD 앱이 Degraded 상태. ExternalSecret이 `SecretSyncedError` 상태였다.

```
could not get ClusterSecretStore "aws-parameter-store",
ClusterSecretStore.external-secrets.io "aws-parameter-store" not found
```

**원인**

ArgoCD GitOps 구조에서 발생하는 구조적 순환 의존성 문제다.

```
ArgoCD가 Git 레포를 읽으려면 → 레포 접근 Secret이 필요
레포 접근 Secret을 만들려면 → ExternalSecret이 필요
ExternalSecret이 동작하려면 → ClusterSecretStore가 필요
ClusterSecretStore를 배포하려면 → ArgoCD가 Git을 읽을 수 있어야 함
```

ArgoCD 자체가 관리 대상이면서 동시에 관리 주체이기 때문에, 초기 부트스트랩 시 이 순환을 끊을 수동 개입 지점이 반드시 필요하다. external-secrets + ArgoCD 조합을 처음 구성할 때 거의 모두가 겪는 문제다.

**해결**

순환을 끊는 수동 apply 순서:

```bash
# 1. ClusterSecretStore 먼저 적용 (순환의 시작점을 수동으로 해소)
kubectl apply -f cluster-secret-store.yaml

# 2. ArgoCD 레포 접근 Secret 생성
kubectl apply -f argocd-repo-external-secret.yaml

# 3. ApplicationSet으로 나머지 앱 자동 배포
kubectl apply -f applicationset.yaml

# ExternalSecret 강제 재sync
kubectl annotate externalsecret db-credentials-external -n pawfiler \
  force-sync="$(date +%s)" --overwrite
```

→ `pawfiler-base`, `pawfiler-auth` 모두 Synced/Healthy 복구

---

## 5. VPC CNI Prefix Delegation - t3.medium 파드 수 한도 초과

**재현 방법**
```bash
kubectl get pods -A | grep Pending
kubectl describe pod <pending-pod> | grep "Too many pods"
# 노드 파드 수 확인
kubectl describe node <node> | grep "Non-terminated Pods"
```

**증상**

모니터링 스택(kube-prometheus-stack, Loki, Grafana, Fluent-bit, OTEL Collector, Kubecost 등) 파드가 추가되면서 t3.medium 노드에서 "Too many pods" 오류로 DaemonSet 파드(fluent-bit, honeybeepf 등)가 Pending 상태가 됐다.

```
t3.medium 최대 파드 수: 17개 (ENI 3개 × IP 6개 - 1 + 2)
모니터링 네임스페이스 파드만 ~20개 이상
```

**원인**

EKS VPC CNI 기본 모드는 파드마다 ENI의 Secondary IP를 1개씩 소모한다. 인스턴스 타입의 ENI 수와 ENI당 IP 수로 최대 파드 수가 결정된다. t3.medium은 구조적으로 17개가 한계다.

더 큰 인스턴스로 교체하면 해결되지만, 비용이 2배 이상 증가한다. VPC CNI Prefix Delegation을 사용하면 ENI당 /28 블록(16개 IP)을 할당해 동일 인스턴스에서 최대 110개 파드를 수용할 수 있다.

**해결**

`aws-node` DaemonSet은 EKS 내장 컴포넌트라 ArgoCD 외부에서 **1회성 kubectl 명령**으로 활성화:

```bash
kubectl set env daemonset aws-node -n kube-system \
  ENABLE_PREFIX_DELEGATION=true \
  WARM_PREFIX_TARGET=1
```

EC2NodeClass에 kubelet maxPods 상향 (`ec2nodeclass.yaml` - ArgoCD로 반영):
```yaml
spec:
  kubelet:
    maxPods: 110
```

기존 노드에 즉시 적용되지 않으므로 노드 롤링 교체 필요:
```bash
# 노드 하나씩 drain 후 삭제 → Karpenter가 새 노드(Prefix Delegation 적용) 프로비저닝
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
kubectl delete node <node>
```

**주의 - /24 서브넷 용량 계산**

Prefix Delegation 활성화 시 노드당 IP 소모:
- t3.medium: 1(노드) + 3 ENI × 16(/28 prefix) = **최대 49개 IP 예약**
- 프라이빗 서브넷 `/24` = 254 IP → AZ당 **최대 5대** 한도
- 2 AZ 합산 최대 10대 (NodePool 리밋 32코어 기준 t3.medium 최대 16대와 차이)

→ 현재 프로젝트 규모(보통 3~5대)에서는 충분. 스케일아웃 시 IP 고갈 모니터링 필요.

**검증 결과 (2026-03-22)**

노드 롤링 교체 후 전체 spot 노드 `pods: 110` 확인:

```bash
kubectl get nodes -l karpenter.sh/nodepool=spot --no-headers | awk '{print $1}' | \
  xargs -I{} sh -c 'echo "=== {} ===" && kubectl describe node {} | grep "pods:"'

# 결과:
# === ip-10-0-101-55.ap-northeast-2.compute.internal ===
#   pods: 110
# === ip-10-0-103-200.ap-northeast-2.compute.internal ===
#   pods: 110
```

**핵심 포인트**: CPU/RAM은 여유가 있었으나 파드 슬롯 한도(17개)만으로 DaemonSet이 Pending.
인스턴스 업그레이드(비용 2배) 없이 Prefix Delegation으로 해결.