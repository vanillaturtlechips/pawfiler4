variable "project_name" {
  description = "Project name"
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

variable "quiz_media_bucket_arn" {
  description = "ARN of the quiz media S3 bucket"
  type        = string
}
