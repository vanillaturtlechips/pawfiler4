# Karpenter 설치 가이드

## 사전 준비

Karpenter는 Kubernetes 클러스터의 자동 스케일링을 담당합니다. Spot 인스턴스를 효율적으로 관리하고 비용을 최적화합니다.

## 설치 단계

### 1. Karpenter IAM Role 생성

```bash
cd terraform
# karpenter.tf 파일이 자동으로 생성됨
terraform apply -target=aws_iam_role.karpenter
```

### 2. Karpenter 설치 (Helm)

```bash
export CLUSTER_NAME=pawfiler-eks-cluster
export AWS_REGION=ap-northeast-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

helm repo add karpenter https://charts.karpenter.sh
helm repo update

helm install karpenter karpenter/karpenter \
  --namespace karpenter \
  --create-namespace \
  --set settings.clusterName=${CLUSTER_NAME} \
  --set settings.interruptionQueue=${CLUSTER_NAME} \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::${AWS_ACCOUNT_ID}:role/pawfiler-karpenter \
  --set controller.resources.requests.cpu=1 \
  --set controller.resources.requests.memory=1Gi \
  --set controller.resources.limits.cpu=1 \
  --set controller.resources.limits.memory=1Gi \
  --wait
```

### 3. NodePool 생성

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["t", "m", "c"]
        - key: karpenter.k8s.aws/instance-size
          operator: In
          values: ["medium", "large"]
      nodeClassRef:
        name: default
  limits:
    cpu: 100
    memory: 100Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: pawfiler-karpenter-node
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: pawfiler-eks-cluster
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: pawfiler-eks-cluster
```

### 4. 기존 Node Group 축소

Karpenter가 작동하면 기존 Managed Node Group을 축소할 수 있습니다:

```bash
cd terraform
# eks.tf에서 desired_size를 줄임
terraform apply
```

## 장점

- **비용 최적화**: Spot 인스턴스 자동 관리
- **빠른 스케일링**: 초 단위 노드 프로비저닝
- **유연한 인스턴스 선택**: 다양한 인스턴스 타입 자동 선택
- **통합 관리**: Spot 중단 자동 처리

## 주의사항

- Karpenter는 자체 노드에서 실행되므로 최소 1개의 On-Demand 노드 필요
- 기존 Cluster Autoscaler와 함께 사용 불가
- Spot 중단 시 자동으로 새 노드 프로비저닝

## 참고

- [Karpenter 공식 문서](https://karpenter.sh/)
- [AWS Karpenter Best Practices](https://aws.github.io/aws-eks-best-practices/karpenter/)
