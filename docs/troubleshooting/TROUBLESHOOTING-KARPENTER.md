# Troubleshooting: Karpenter NodePool 설정 문제

## 문제 상황

Karpenter를 설치했지만 NodePool이 작동하지 않고 다음 에러가 발생했습니다:

```
ERROR: ignoring nodepool, not ready
ERROR: no subnets found
ERROR: AccessDenied: iam:GetInstanceProfile
```

## 원인 분석

### 1. Subnet Selector 문제

**에러:**
```json
{
  "error": "no subnets found",
  "controller": "nodeclass"
}
```

**원인:**
- EC2NodeClass가 `karpenter.sh/discovery` 태그로 서브넷 검색
- 실제 서브넷은 `Name: pawfiler-private-subnet-*` 태그만 존재

**확인:**
```bash
aws ec2 describe-subnets \
  --filters "Name=tag:karpenter.sh/discovery,Values=pawfiler-eks-cluster" \
  --region ap-northeast-2
# 결과: []
```

### 2. IAM 권한 부족

**에러:**
```json
{
  "error": "User is not authorized to perform: iam:GetInstanceProfile",
  "aws-error-code": "AccessDenied"
}
```

**원인:**
- Karpenter controller에 Instance Profile 관련 권한 없음
- 필요 권한: `GetInstanceProfile`, `CreateInstanceProfile`, `TagInstanceProfile`

### 3. EKS 버전 호환성

**에러:**
```
Karpenter v1.0.0 requires EKS 1.30+
Current EKS version: 1.29
```

**원인:**
- Karpenter 최신 버전이 EKS 1.30+ 요구
- 우리 클러스터는 1.29

## 해결 방법

### 1. Subnet Selector 수정

**변경 전:**
```yaml
spec:
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: pawfiler-eks-cluster
```

**변경 후:**
```yaml
spec:
  subnetSelectorTerms:
    - tags:
        Name: "pawfiler-private-subnet-*"
```

### 2. IAM 권한 추가

**Terraform 수정:**
```hcl
# terraform/modules/karpenter/main.tf
resource "aws_iam_role_policy" "karpenter_controller" {
  policy = jsonencode({
    Statement = [
      {
        Action = [
          "ec2:CreateFleet",
          "ec2:RunInstances",
          # 추가된 권한
          "iam:GetInstanceProfile",
          "iam:ListInstanceProfiles",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:TagInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile"
        ]
        Resource = "*"
      }
    ]
  })
}
```

**즉시 적용 (AWS CLI):**
```bash
aws iam put-role-policy \
  --role-name pawfiler-karpenter-controller \
  --policy-name pawfiler-karpenter-controller-policy \
  --policy-document file://karpenter-policy.json
```

### 3. Karpenter 버전 다운그레이드

**변경 전:**
```hcl
version = "1.0.0"  # EKS 1.30+ 필요
```

**변경 후:**
```hcl
version = "0.37.0"  # EKS 1.29 호환
```

또는 EKS 업그레이드:
```bash
aws eks update-cluster-version \
  --name pawfiler-eks-cluster \
  --kubernetes-version 1.31
```

## 검증

### NodePool 상태 확인

```bash
kubectl get nodepool default -o yaml
```

**정상 출력:**
```yaml
status:
  conditions:
  - type: Ready
    status: "True"
    reason: NodeClassReady
  - type: NodeClassReady
    status: "True"
```

### 부하 테스트

```bash
# 테스트 deployment 생성
kubectl create deployment load-test \
  --image=registry.k8s.io/pause:3.9 \
  --replicas=10

# NodeClaim 생성 확인
kubectl get nodeclaim

# 노드 생성 확인
kubectl get nodes -l karpenter.sh/capacity-type=spot
```

**결과:**
```
NAME                                              CAPACITY-TYPE
ip-10-0-103-56.ap-northeast-2.compute.internal    spot
ip-10-0-103-139.ap-northeast-2.compute.internal   spot
ip-10-0-103-186.ap-northeast-2.compute.internal   spot
```

## 최종 설정

```yaml
# k8s/karpenter/nodepool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["t3.medium"]
  limits:
    cpu: "10"
    memory: "20Gi"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m

---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiSelectorTerms:
    - alias: al2@latest
  role: pawfiler-karpenter-node
  subnetSelectorTerms:
    - tags:
        Name: "pawfiler-private-subnet-*"
  securityGroupSelectorTerms:
    - tags:
        Name: "pawfiler-eks-cluster-sg"
```

## 교훈

1. **태그 확인**: 리소스 selector는 실제 태그와 일치해야 함
2. **IAM 권한**: Karpenter는 생각보다 많은 권한 필요
3. **버전 호환성**: EKS와 Karpenter 버전 매트릭스 확인 필수
4. **점진적 적용**: 작은 부하로 테스트 후 프로덕션 적용

## 참고

- [Karpenter 공식 문서](https://karpenter.sh/)
- [EKS 버전 호환성](https://karpenter.sh/docs/upgrading/compatibility/)
- 관련 커밋: `feat: Karpenter spot autoscaling with t3.medium`
