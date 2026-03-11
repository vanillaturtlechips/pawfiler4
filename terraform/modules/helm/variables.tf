variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "cluster_endpoint" {
  description = "EKS cluster endpoint"
  type        = string
}

variable "cluster_arn" {
  description = "EKS cluster ARN"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL for IRSA"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}

# variable "enable_karpenter" {
#   description = "Enable Karpenter autoscaler"
#   type        = bool
#   default     = false
# }
#
# variable "karpenter_queue_name" {
#   description = "SQS queue name for Karpenter spot interruption"
#   type        = string
#   default     = ""
# }
#
# variable "karpenter_controller_role_arn" {
#   description = "ARN of the Karpenter controller IAM role"
#   type        = string
#   default     = ""
# }

variable "karpenter_node_role_name" {
  description = "Name of the Karpenter node IAM role"
  type        = string
  default     = ""
}

variable "kubecost_token" {
  description = "Kubecost token for cost monitoring"
  type        = string
  default     = ""
  sensitive   = true
}

variable "argocd_admin_password" {
  description = "ArgoCD admin password (bcrypt hash)"
  type        = string
  default     = ""
  sensitive   = true
}

