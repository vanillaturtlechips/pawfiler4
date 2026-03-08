variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "pawfiler"
}

variable "envoy_alb_domain" {
  description = "Envoy ALB domain for CloudFront origin (get from kubectl get ingress)"
  type        = string
  default     = ""
}

variable "enable_karpenter" {
  description = "Enable Karpenter autoscaler (EKS 1.34 has compatibility issues, use false)"
  type        = bool
  default     = false
}
