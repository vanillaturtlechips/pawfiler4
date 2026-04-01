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

variable "lambda_s3_bucket" {
  description = "S3 버킷명 — Lambda zip 패키지 저장 위치"
  type        = string
  default     = ""
}

variable "lambda_s3_key" {
  description = "S3 키 — Lambda zip 패키지 경로 (예: lambda/report.zip)"
  type        = string
  default     = "lambda/report.zip"
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
