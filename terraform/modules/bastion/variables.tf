variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "eks_cluster_security_group_id" {
  description = "EKS cluster security group ID (for allowing bastion access)"
  type        = string
}

variable "bastion_instance_type" {
  description = "EC2 instance type for the Bastion Host"
  type        = string
  default     = "t3.micro"
}

variable "bastion_key_name" {
  description = "EC2 Key Pair name for Bastion Host SSH access"
  type        = string
  default     = ""
}
