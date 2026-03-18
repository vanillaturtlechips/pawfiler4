# Troubleshooting: 로컬 CLI에서 EKS 클러스터 접근 불가

## 문제 상황

로컬 개발 환경에서 `kubectl` 명령어가 작동하지 않았습니다.

```bash
kubectl get nodes
# error: You must be logged in to the server (Unauthorized)
```

## 원인 분석

### 1. kubeconfig 미설정

```bash
kubectl config view
# clusters: []
# contexts: []
# users: []
```

**원인:**
- EKS 클러스터 정보가 로컬 kubeconfig에 없음
- AWS 인증 정보 누락

### 2. IAM 권한 부족

```bash
aws eks describe-cluster --name pawfiler-eks-cluster
# AccessDeniedException: User is not authorized
```

**원인:**
- IAM 사용자/역할에 EKS 접근 권한 없음
- EKS 클러스터의 aws-auth ConfigMap에 등록 안 됨

### 3. 보안 그룹 제한

```bash
kubectl get nodes
# dial tcp: i/o timeout
```

**원인:**
- EKS API 서버가 private endpoint만 활성화
- 로컬 IP가 보안 그룹에서 차단됨

## 해결 방법

### 1. kubeconfig 설정

```bash
# EKS 클러스터 정보 가져오기
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name pawfiler-eks-cluster

# 확인
kubectl config current-context
# arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster
```

**자동 설정 내용:**
```yaml
# ~/.kube/config
clusters:
- cluster:
    certificate-authority-data: <base64>
    server: https://ABC123.gr7.ap-northeast-2.eks.amazonaws.com
  name: arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster

contexts:
- context:
    cluster: arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster
    user: arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster
  name: arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster

users:
- name: arn:aws:eks:ap-northeast-2:123456789012:cluster/pawfiler-eks-cluster
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: aws
      args:
        - eks
        - get-token
        - --cluster-name
        - pawfiler-eks-cluster
```

### 2. IAM 권한 추가

#### 방법 A: IAM 정책 추가 (권장)

```bash
# IAM 사용자에게 EKS 읽기 권한 부여
aws iam attach-user-policy \
  --user-name your-username \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy
```

#### 방법 B: EKS Access Entry 추가 (EKS 1.23+)

**Terraform:**
```hcl
# terraform/modules/eks/main.tf
resource "aws_eks_access_entry" "developer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = "arn:aws:iam::123456789012:user/developer"
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "developer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_eks_access_entry.developer.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}
```

**적용:**
```bash
cd terraform
terraform apply -target=aws_eks_access_entry.developer
```

#### 방법 C: aws-auth ConfigMap 수정 (레거시)

```bash
kubectl edit configmap aws-auth -n kube-system
```

**추가:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapUsers: |
    - userarn: arn:aws:iam::123456789012:user/developer
      username: developer
      groups:
        - system:masters
```

### 3. 네트워크 접근 설정

#### 옵션 A: Bastion 호스트 사용 (권장)

```bash
# Bastion 시작
cd terraform
./docs/start-bastion.sh

# SSH 터널링
ssh -i ~/.ssh/pawfiler-key.pem \
  -L 8443:ABC123.gr7.ap-northeast-2.eks.amazonaws.com:443 \
  ec2-user@<bastion-public-ip>

# kubeconfig 수정
kubectl config set-cluster pawfiler-eks-cluster \
  --server=https://localhost:8443
```

#### 옵션 B: EKS Public Endpoint 활성화

**Terraform:**
```hcl
# terraform/modules/eks/main.tf
resource "aws_eks_cluster" "main" {
  vpc_config {
    endpoint_private_access = true
    endpoint_public_access  = true  # 활성화
    public_access_cidrs     = ["YOUR_IP/32"]  # 특정 IP만 허용
  }
}
```

**즉시 적용:**
```bash
aws eks update-cluster-config \
  --name pawfiler-eks-cluster \
  --resources-vpc-config \
    endpointPublicAccess=true,publicAccessCidrs=["YOUR_IP/32"]
```

#### 옵션 C: 보안 그룹 규칙 추가

```bash
# 현재 IP 확인
MY_IP=$(curl -s ifconfig.me)

# 보안 그룹에 규칙 추가
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 443 \
  --cidr ${MY_IP}/32
```

## 검증

### 1. 연결 테스트

```bash
# 클러스터 정보 확인
kubectl cluster-info
# Kubernetes control plane is running at https://...

# 노드 목록
kubectl get nodes
# NAME                                              STATUS   ROLES    AGE
# ip-10-0-101-34.ap-northeast-2.compute.internal    Ready    <none>   1d
```

### 2. 권한 확인

```bash
# 현재 사용자 확인
kubectl auth whoami
# Username: arn:aws:iam::123456789012:user/developer

# 권한 테스트
kubectl auth can-i get pods
# yes

kubectl auth can-i create deployments
# yes
```

### 3. 네트워크 확인

```bash
# API 서버 연결 테스트
curl -k https://ABC123.gr7.ap-northeast-2.eks.amazonaws.com/healthz
# ok
```

## 권장 설정

### 개발 환경

```bash
# ~/.bashrc 또는 ~/.zshrc
export AWS_PROFILE=pawfiler-dev
export AWS_REGION=ap-northeast-2

# kubectl 자동완성
source <(kubectl completion bash)
alias k=kubectl
complete -F __start_kubectl k
```

### 스크립트 자동화

```bash
#!/bin/bash
# scripts/connect-eks.sh

# kubeconfig 업데이트
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name pawfiler-eks-cluster

# 연결 확인
kubectl get nodes

echo "✅ EKS 클러스터 연결 완료"
```

## 보안 권장사항

1. **최소 권한 원칙**: 필요한 권한만 부여
2. **IP 화이트리스트**: Public endpoint 사용 시 특정 IP만 허용
3. **Bastion 사용**: 프로덕션 환경은 Bastion 통해서만 접근
4. **임시 자격증명**: AWS SSO 또는 임시 토큰 사용
5. **감사 로깅**: CloudTrail로 모든 API 호출 기록

## 트러블슈팅 체크리스트

- [ ] AWS CLI 설치 및 설정 (`aws configure`)
- [ ] kubectl 설치 (`brew install kubectl`)
- [ ] kubeconfig 업데이트 (`aws eks update-kubeconfig`)
- [ ] IAM 권한 확인 (`aws sts get-caller-identity`)
- [ ] EKS Access Entry 등록 (Terraform)
- [ ] 네트워크 접근 가능 (Bastion 또는 Public endpoint)
- [ ] 보안 그룹 규칙 확인

## 교훈

1. **자동화**: kubeconfig 설정을 스크립트로 자동화
2. **문서화**: 팀원 온보딩 가이드 작성
3. **보안**: 프로덕션은 Bastion 필수
4. **권한 관리**: EKS Access Entry로 중앙 관리

## 참고

- [EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [kubectl 설치](https://kubernetes.io/docs/tasks/tools/)
- 관련 스크립트: `terraform/docs/start-bastion.sh`
