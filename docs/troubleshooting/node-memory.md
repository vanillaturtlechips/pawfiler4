# Node Memory High Usage Troubleshooting

## 문제 상황
```bash
$ kubectl top nodes
NAME                                              CPU(cores)   CPU(%)      MEMORY(bytes)   MEMORY(%)   
ip-10-0-103-239.ap-northeast-2.compute.internal   85m          4%          2588Mi          78%
```

노드 메모리 사용률이 78%로 높게 나타남.

## 원인 분석

### 1. 노드 스펙 확인
```bash
$ kubectl describe node ip-10-0-103-239.ap-northeast-2.compute.internal | grep -E "Capacity|Allocatable" -A 5

Capacity:
  cpu:                2
  memory:             3931728Ki  # ~3.8GB

Allocatable:
  cpu:                1930m
  memory:             3376720Ki  # ~3.3GB
```

**노드 타입**: t3.medium (2 vCPU, ~3.3GB 메모리)

### 2. 리소스 오버커밋 확인
```bash
$ kubectl describe node ip-10-0-103-239.ap-northeast-2.compute.internal | grep -A 5 "Allocated resources"

Allocated resources:
  Resource           Requests      Limits
  --------           --------      ------
  cpu                1300m (67%)   2200m (113%)
  memory             2076Mi (62%)  6314Mi (191%)  # ⚠️ 191% 오버커밋
```

**문제**: Memory limits가 191% 오버커밋되어 있음.

### 3. 메모리 사용량 Top Pods
```bash
$ kubectl top pods -A --sort-by=memory | head -10

NAMESPACE     NAME                                    CPU(cores)   MEMORY(bytes)   
monitoring    kubecost-cost-analyzer-xxx              4m           1054Mi          # 32%
pawfiler      video-analysis-xxx-1                    4m           407Mi           # 12%
pawfiler      video-analysis-xxx-2                    4m           323Mi           # 10%
monitoring    kubecost-prometheus-server-xxx          3m           157Mi           # 5%
monitoring    kubecost-forecasting-xxx                1m           136Mi           # 4%
monitoring    grafana-xxx                             2m           98Mi            # 3%
```

**주요 원인**:
1. **kubecost-cost-analyzer**: 1054Mi (32%) - 리소스 제한 없음
2. **video-analysis**: 730Mi (22%) - limits 1Gi로 과도하게 설정
3. **prometheus-server**: 157Mi (5%) - 리소스 제한 없음

### 4. 해당 노드의 Pod 배치
```bash
$ kubectl get pods -A -o wide | grep ip-10-0-103-239

monitoring    kubecost-cost-analyzer-xxx              # 1054Mi
monitoring    kubecost-prometheus-server-xxx          # 157Mi
pawfiler      video-analysis-xxx                      # 407Mi
pawfiler      community-service-xxx                   # ~100Mi
pawfiler      envoy-xxx                               # 82Mi
argocd        argocd-server-xxx                       # ~50Mi
...
```

## 해결 방안

### 방안 1: video-analysis 리소스 조정 (즉시 적용 가능)

**현재 설정**:
```yaml
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi  # 실제 사용량 400Mi
```

**권장 설정**:
```yaml
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi  # 실제 사용량 기준 여유 확보
```

**적용**:
```bash
# ArgoCD repo 수정
vi pawfiler4-argocd/apps/services/video-analysis/deployment.yaml

# 또는 직접 적용
kubectl edit deploy video-analysis -n pawfiler
```

### 방안 2: Kubecost 리소스 제한 추가

**Terraform helm 모듈 수정**:
```hcl
# terraform/modules/helm/main.tf

resource "helm_release" "kubecost" {
  # ... 기존 설정 ...

  # Cost Analyzer 리소스 제한
  set {
    name  = "kubecostModel.resources.requests.memory"
    value = "256Mi"
  }
  set {
    name  = "kubecostModel.resources.limits.memory"
    value = "512Mi"
  }

  # Prometheus 리소스 제한
  set {
    name  = "prometheus.server.resources.requests.memory"
    value = "128Mi"
  }
  set {
    name  = "prometheus.server.resources.limits.memory"
    value = "256Mi"
  }
}
```

**적용**:
```bash
cd terraform
terraform apply -target=module.helm
```

### 방안 3: 노드 타입 업그레이드 (장기 해결)

**현재**: t3.medium (2 vCPU, 4GB RAM)
**권장**: t3.large (2 vCPU, 8GB RAM)

**Terraform 수정**:
```hcl
# terraform/modules/eks/main.tf

resource "aws_eks_node_group" "main" {
  instance_types = ["t3.large"]  # t3.medium → t3.large
  
  scaling_config {
    desired_size = 3
    max_size     = 5
    min_size     = 2
  }
}
```

**적용**:
```bash
cd terraform
terraform apply -target=module.eks.aws_eks_node_group.main
```

## 권장 조치 순서

1. **즉시**: video-analysis limits 조정 (1Gi → 512Mi)
2. **단기**: Kubecost 리소스 제한 추가
3. **장기**: 노드 타입 t3.large로 업그레이드 고려

## 모니터링

```bash
# 노드 메모리 사용률 모니터링
watch -n 5 'kubectl top nodes'

# Pod별 메모리 사용량
kubectl top pods -A --sort-by=memory

# 특정 노드의 리소스 할당 확인
kubectl describe node <node-name> | grep -A 10 "Allocated resources"
```

## 참고

- t3.medium: 4GB RAM → Allocatable ~3.3GB (시스템 예약 제외)
- Memory limits 오버커밋은 가능하지만, 실제 사용량이 초과하면 OOMKilled 발생
- Kubecost는 비용 모니터링 도구로 프로덕션에서는 리소스 제한 필수
