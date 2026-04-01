# ============================================================================
# ROOT VARIABLES - common-variables.tf 대체 + 모듈 변수 통합
# ============================================================================

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

variable "alb_domain" {
  description = "ALB domain for CloudFront origin (Route53: api.pawfiler.site → ALB)"
  type        = string
  default     = "api.pawfiler.site"
}

variable "enable_karpenter" {
  description = "Enable Karpenter autoscaler"
  type        = bool
  default     = true
}

variable "enable_istio" {
  description = "Enable Istio service mesh (istio-base + istiod, sidecar injection on pawfiler namespace)"
  type        = bool
  default     = true
}

# Networking variables
variable "vpc_cidr_block" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.103.0/24"]
}

# EKS variables
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "pawfiler-eks-cluster"
}

variable "eks_version" {
  description = "EKS cluster version"
  type        = string
  default     = "1.31"
}

variable "node_instance_types" {
  description = "Instance types for EKS nodes"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_desired_size" {
  description = "Desired number of nodes"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of nodes"
  type        = number
  default     = 1
}

variable "node_min_size" {
  description = "Minimum number of nodes"
  type        = number
  default     = 1
}

# IAM/Admin variables
variable "admin_users" {
  description = "List of admin user ARNs for EKS access"
  type        = list(string)
  default = [
    "arn:aws:iam::009946608368:user/RAPA_Admin",
    "arn:aws:iam::009946608368:user/SGO-Junghan",
    "arn:aws:iam::009946608368:user/SGO-Jaewon",
    "arn:aws:iam::009946608368:user/SGO-LeeMyungil",
    "arn:aws:iam::009946608368:user/SGO-Moonjae"
  ]
}

# RDS variables
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

# Bastion variables
variable "bastion_instance_type" {
  description = "EC2 instance type for the Bastion Host"
  type        = string
  default     = "t3.micro"
}

variable "bastion_key_name" {
  description = "EC2 Key Pair name for Bastion Host SSH access"
  type        = string
  default     = "pawfiler"
}

# Helm variables
variable "kubecost_token" {
  description = "Kubecost token for cost monitoring"
  type        = string
  default     = ""
  sensitive   = true
}

variable "argocd_admin_password" {
  description = "ArgoCD admin password (bcrypt hash)"
  type        = string
  default     = ""
  sensitive   = true
}
