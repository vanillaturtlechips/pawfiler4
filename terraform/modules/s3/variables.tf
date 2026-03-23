variable "project_name" {
  description = "Project name"
  type        = string
}

variable "alb_domain" {
  description = "ALB domain for CloudFront origin (Route53: api.pawfiler.site → ALB)"
  type        = string
  default     = "api.pawfiler.site"
}
