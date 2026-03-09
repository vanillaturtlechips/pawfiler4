variable "project_name" {
  description = "Project name"
  type        = string
}

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
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of nodes"
  type        = number
  default     = 4
}

variable "node_min_size" {
  description = "Minimum number of nodes"
  type        = number
  default     = 1
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "eks_cluster_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  type        = string
}

variable "eks_node_group_role_arn" {
  description = "ARN of the EKS node group IAM role"
  type        = string
}

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
