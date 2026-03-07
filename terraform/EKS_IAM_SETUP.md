# EKS IAM 사용자 접근 권한 설정 가이드

## 개요

EKS 클러스터를 생성한 후, 팀원들이 `kubectl`로 접근할 수 있도록 IAM 사용자를 추가하는 방법입니다.

**⚠️ 주의**: 이 작업은 EKS 클러스터를 생성한 사람만 수행할 수 있습니다.

---

## 방법 1: EKS Access Entry 사용 (권장, EKS 1.23+)

### 1단계: 각 팀원의 IAM 사용자 ARN 확인

```bash
# 팀원들에게 각자 실행하도록 요청
aws sts get-caller-identity --query Arn --output text
```

**예시 출력**:
```
arn:aws:iam::009946608368:user/SGO-Junghan
arn:aws:iam::009946608368:user/SGO-Jaewon
arn:aws:iam::009946608368:user/RAPA_Admin
arn:aws:iam::009946608368:user/SGO-Moonjae
```

### 2단계: Access Entry 추가 (클러스터 생성자가 실행)

```bash
# 클러스터 이름 설정
CLUSTER_NAME="pawfiler-eks-cluster"

# 각 팀원의 ARN을 배열로 저장
ADMIN_USERS=(
  "arn:aws:iam::009946608368:user/SGO-Junghan"
  "arn:aws:iam::009946608368:user/SGO-Jaewon"
  "arn:aws:iam::009946608368:user/RAPA_Admin"
  "arn:aws:iam::009946608368:user/SGO-Moonjae"
)

# 각 사용자에 대해 Access Entry 생성
for USER_ARN in "${ADMIN_USERS[@]}"; do
  echo "Adding access for: $USER_ARN"
  
  # Access Entry 생성
  aws eks create-access-entry \
    --cluster-name $CLUSTER_NAME \
    --principal-arn $USER_ARN \
    --type STANDARD \
    --region ap-northeast-2
  
  # 관리자 정책 연결
  aws eks associate-access-policy \
    --cluster-name $CLUSTER_NAME \
    --principal-arn $USER_ARN \
    --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
    --access-scope type=cluster \
    --region ap-northeast-2
  
  echo "✅ Access granted for: $USER_ARN"
  echo ""
done

echo "🎉 모든 팀원에게 접근 권한이 부여되었습니다!"
```

### 3단계: 팀원들이 kubectl 설정 (각자 실행)

```bash
# kubeconfig 업데이트
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name pawfiler-eks-cluster

# 연결 확인
kubectl get nodes
kubectl get pods --all-namespaces
```

---

## 방법 2: aws-auth ConfigMap 수정 (레거시 방식)

### 1단계: 현재 aws-auth ConfigMap 확인

```bash
kubectl get configmap aws-auth -n kube-system -o yaml
```

### 2단계: ConfigMap 편집

```bash
kubectl edit configmap aws-auth -n kube-system
```

### 3단계: mapUsers 섹션 추가

기존 ConfigMap에 다음 내용을 추가합니다:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    # 기존 내용 유지
    - rolearn: arn:aws:iam::009946608368:role/pawfiler-eks-node-group-role
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
  
  # 이 부분을 추가
  mapUsers: |
    - userarn: arn:aws:iam::009946608368:user/SGO-Junghan
      username: sgo-junghan
      groups:
        - system:masters
    - userarn: arn:aws:iam::009946608368:user/SGO-Jaewon
      username: sgo-jaewon
      groups:
        - system:masters
    - userarn: arn:aws:iam::009946608368:user/RAPA_Admin
      username: rapa-admin
      groups:
        - system:masters
    - userarn: arn:aws:iam::009946608368:user/SGO-Moonjae
      username: sgo-moonjae
      groups:
        - system:masters
```

### 4단계: 저장 및 확인

```bash
# 저장 후 확인
kubectl get configmap aws-auth -n kube-system -o yaml

# 팀원들이 각자 kubectl 설정
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
kubectl get nodes
```

---

## 권한 레벨 설명

### system:masters (전체 관리자)
- 클러스터의 모든 리소스에 대한 전체 권한
- 네임스페이스, 서비스, 배포 등 모든 작업 가능

### 다른 권한 그룹 (필요시 사용)

```yaml
# 읽기 전용 권한
groups:
  - system:authenticated

# 특정 네임스페이스만 관리
groups:
  - system:authenticated
# 추가로 RoleBinding 필요
```

---

## 접근 권한 확인

### 현재 사용자 확인
```bash
aws sts get-caller-identity
```

### kubectl 권한 테스트
```bash
# 노드 조회
kubectl get nodes

# 모든 네임스페이스의 Pod 조회
kubectl get pods --all-namespaces

# 특정 네임스페이스에 배포
kubectl create namespace test
kubectl delete namespace test
```

---

## 접근 권한 제거

### Access Entry 제거 (방법 1)
```bash
aws eks delete-access-entry \
  --cluster-name pawfiler-eks-cluster \
  --principal-arn arn:aws:iam::009946608368:user/USERNAME \
  --region ap-northeast-2
```

### aws-auth ConfigMap에서 제거 (방법 2)
```bash
kubectl edit configmap aws-auth -n kube-system
# mapUsers에서 해당 사용자 항목 삭제
```

---

## 트러블슈팅

### 문제: "error: You must be logged in to the server (Unauthorized)"

**원인**: IAM 사용자가 EKS 접근 권한이 없음

**해결**:
1. 클러스터 생성자에게 Access Entry 추가 요청
2. 또는 aws-auth ConfigMap에 사용자 추가 요청

### 문제: "error: the server doesn't have a resource type 'nodes'"

**원인**: kubeconfig가 올바르게 설정되지 않음

**해결**:
```bash
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
```

### 문제: Access Entry 생성 시 "ResourceInUseException"

**원인**: 해당 사용자의 Access Entry가 이미 존재함

**해결**:
```bash
# 기존 Access Entry 확인
aws eks list-access-entries \
  --cluster-name pawfiler-eks-cluster \
  --region ap-northeast-2

# 필요시 삭제 후 재생성
aws eks delete-access-entry \
  --cluster-name pawfiler-eks-cluster \
  --principal-arn arn:aws:iam::009946608368:user/USERNAME \
  --region ap-northeast-2
```

---

## 참고 자료

- [EKS Access Entries 공식 문서](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)
- [aws-auth ConfigMap 관리](https://docs.aws.amazon.com/eks/latest/userguide/add-user-role.html)
- [EKS 권한 관리 모범 사례](https://aws.github.io/aws-eks-best-practices/security/docs/iam/)
