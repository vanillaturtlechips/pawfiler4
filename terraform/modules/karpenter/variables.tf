variable "project_name" {
  description = "Project name"
  type        = string
}

variable "enable_karpenter" {
  description = "Enable Karpenter autoscaler"
  type        = bool
  default     = false
}

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
