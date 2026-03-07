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

variable "envoy_nlb_domain" {
  description = "Envoy NLB domain for CloudFront origin (get from kubectl get svc)"
  type        = string
  default     = ""
}
