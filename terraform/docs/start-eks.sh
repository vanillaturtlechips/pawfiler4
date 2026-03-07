#!/bin/bash

set -e

CLUSTER_NAME="pawfiler-eks-cluster"
REGION="ap-northeast-2"

TEAM_ARNS=(
  "arn:aws:iam::009946608368:user/SGO-Junghan"
  "arn:aws:iam::009946608368:user/SGO-Jaewon"
  "arn:aws:iam::009946608368:user/RAPA_Admin"
  "arn:aws:iam::009946608368:user/SGO-Moonjae"
  "arn:aws:iam::009946608368:user/SGO-LeeMyungil"
)

echo "🚀 EKS 클러스터 시작 중..."
terraform apply -auto-approve \
  -target=aws_security_group.eks_cluster \
  -target=aws_eks_cluster.main \
  -target=aws_eks_node_group.main \
  -target=aws_eks_addon.ebs_csi_driver \
  -target=aws_iam_role.bastion \
  -target=aws_iam_instance_profile.bastion \
  -target=aws_instance.bastion

# Bastion IAM 역할 ARN 자동으로 가져오기
BASTION_ROLE_ARN=$(terraform output -raw bastion_role_arn)
echo "🔑 Bastion Role ARN: $BASTION_ROLE_ARN"
TEAM_ARNS+=("$BASTION_ROLE_ARN")

echo "⚙️  kubectl 설정 중..."
aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"

echo "⏳ 노드 Ready 대기 중 (최대 5분)..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s

echo "👥 팀원 Access Entry 등록 중..."
for ARN in "${TEAM_ARNS[@]}"; do
  echo "  → $ARN"
  aws eks create-access-entry \
    --cluster-name "$CLUSTER_NAME" \
    --principal-arn "$ARN" \
    --region "$REGION" 2>/dev/null && echo "    ✅ 생성 완료" || echo "    ⏭️  이미 존재, 스킵"

  aws eks associate-access-policy \
    --cluster-name "$CLUSTER_NAME" \
    --principal-arn "$ARN" \
    --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
    --access-scope type=cluster \
    --region "$REGION"
done

echo "✅ EKS 클러스터 준비 완료!"
kubectl get nodes