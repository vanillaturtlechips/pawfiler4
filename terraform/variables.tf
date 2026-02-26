variable "aws_region" {
  description = "AWS Region to deploy resources"
  type        = string
  default     = "ap-northeast-2" # 서울 리전
}

variable "project_name" {
  description = "Name of the project, used as a prefix for resources"
  type        = string
  default     = "pawfiler"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "pawfiler-eks-cluster"
}

variable "vpc_cidr_block" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
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

variable "database_username" {
  description = "RDS PostgreSQL master username"
  type        = string
  default     = "pawfiler"
}

variable "database_password" {
  description = "RDS PostgreSQL master password"
  type        = string
  sensitive   = true
  default     = "dev_password" # 실제 운영 환경에서는 AWS Secrets Manager 등을 사용하세요.
}

variable "kafka_broker_node_instance_type" {
  description = "MSK Kafka broker node instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "kafka_number_of_broker_nodes" {
  description = "Number of MSK Kafka broker nodes per AZ"
  type        = number
  default     = 1
}

variable "bastion_key_name" {
  description = "Name of the EC2 Key Pair to access the Bastion host"
  type        = string
  default     = "pawfiler-bastion-key" # 미리 생성된 키 페어 이름 사용 권장
}

