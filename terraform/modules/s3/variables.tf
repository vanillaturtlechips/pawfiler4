variable "project_name" {
  description = "Project name"
  type        = string
}

variable "envoy_alb_domain" {
  description = "Envoy ALB domain for CloudFront origin (get from kubectl get ingress)"
  type        = string
  default     = ""
}
