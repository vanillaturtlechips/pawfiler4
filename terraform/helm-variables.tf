variable "kubecost_token" {
  description = "Kubecost token for enterprise features (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "argocd_admin_password" {
  description = "ArgoCD admin password (optional, auto-generated if not provided)"
  type        = string
  default     = ""
  sensitive   = true
}
