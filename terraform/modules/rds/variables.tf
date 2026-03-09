variable "project_name" {
  description = "Project name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (for RDS SG ingress)"
  type        = list(string)
}

variable "bastion_security_group_id" {
  description = "Security group ID of the bastion host"
  type        = string
}

variable "database_instance_type" {
  description = "RDS PostgreSQL instance type"
  type        = string
  default     = "db.t3.micro"
}

variable "database_allocated_storage" {
  description = "RDS PostgreSQL allocated storage in GB"
  type        = number
  default     = 20
}

variable "database_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16"
}

variable "database_username" {
  description = "RDS PostgreSQL master username"
  type        = string
  default     = "pawfiler"
}

variable "database_password" {
  description = "RDS PostgreSQL master password"
  type        = string
  sensitive   = true
  default     = "dev_password"
}
