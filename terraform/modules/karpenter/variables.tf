variable "project_name" {
  description = "Project name"
  type        = string
}

variable "enable_karpenter" {
  description = "Enable Karpenter autoscaler (현재 disable - CA와 부하테스트 비교 후 전환 예정)"
  type        = bool
  default     = false
}

# Karpenter NodePool 설정 메모 (k8s/karpenter/nodepool.yaml)
# - AMI: al2@v1.31 고정 (al2@latest 사용 시 클러스터 버전 불일치로 1.34 노드 생성됨)
# - capacity-type: spot only
# - instance-type: t3.medium
# - 적용: kubectl apply -f k8s/karpenter/nodepool.yaml

variable "oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL for IRSA"
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "cluster_arn" {
  description = "EKS cluster ARN"
  type        = string
}
