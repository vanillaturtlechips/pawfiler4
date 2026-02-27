# ============================================================================
# MAIN - Root Configuration
# ============================================================================
# This file serves as the entry point for Terraform configuration.
# All resources are organized in separate files by module for better maintainability.
#
# Module Files:
# - networking.tf: VPC, Subnets, NAT Gateway, Route Tables
# - iam.tf: IAM Roles and Policies
# - eks.tf: EKS Cluster and Node Groups
# - rds.tf: PostgreSQL Database
# - ecr.tf: Elastic Container Registry
# - bastion.tf: Bastion Host for SSH Access
#
# To apply all resources:
#   terraform init
#   terraform plan
#   terraform apply
