# ============================================================================
# LAMBDA REPORT MODULE - Variables
# ============================================================================

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}

variable "database_url" {
  description = "PostgreSQL connection URL for the report Lambda (RDS Proxy endpoint 권장)"
  type        = string
  sensitive   = true
}

variable "vpc_id" {
  description = "VPC ID for Lambda VPC config"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda VPC config"
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "RDS security group ID — Lambda SG를 여기에 ingress 허용"
  type        = string
}

variable "ecr_image_uri" {
  description = "ECR image URI (비워두면 ECR 리포지토리 URL:latest 사용, 첫 apply 후 이미지 push 필요)"
  type        = string
  default     = ""
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds (max 900)"
  type        = number
  default     = 300
}

variable "lambda_memory" {
  description = "Lambda function memory in MB"
  type        = number
  default     = 1024
}
