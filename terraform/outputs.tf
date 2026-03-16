# ============================================================================
# ROOT OUTPUTS
# ============================================================================

# Networking
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "List of IDs of the public subnets"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "List of IDs of the private subnets"
  value       = module.networking.private_subnet_ids
}

# IAM
output "eks_cluster_role_arn" {
  description = "ARN of the EKS cluster role"
  value       = module.iam.eks_cluster_role_arn
}

output "eks_node_group_role_arn" {
  description = "ARN of the EKS node group role"
  value       = module.iam.eks_node_group_role_arn
}

# EKS
output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = module.eks.eks_cluster_name
}

output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster"
  value       = module.eks.eks_cluster_endpoint
}

output "eks_node_group_arn" {
  description = "The ARN of the EKS node group"
  value       = module.eks.eks_node_group_arn
}

# RDS
output "rds_instance_address" {
  description = "The address of the RDS instance"
  value       = module.rds.rds_instance_address
  sensitive   = true
}

output "rds_instance_port" {
  description = "The port of the RDS instance"
  value       = module.rds.rds_instance_port
}

output "rds_instance_endpoint" {
  description = "The endpoint of the RDS instance"
  value       = module.rds.rds_instance_endpoint
  sensitive   = true
}

# ECR
output "ecr_repository_urls" {
  description = "Map of ECR repository URLs for application services"
  value       = module.ecr.ecr_repository_urls
}

# S3 / CloudFront
output "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = module.s3.frontend_bucket_name
}

output "frontend_cloudfront_url" {
  description = "Frontend CloudFront distribution URL"
  value       = module.s3.frontend_cloudfront_url
}

output "admin_frontend_bucket_name" {
  description = "Admin Frontend S3 bucket name"
  value       = module.s3.admin_frontend_bucket_name
}

output "admin_frontend_s3_website_url" {
  description = "Admin Frontend S3 website URL"
  value       = module.s3.admin_frontend_s3_website_url
}

output "quiz_media_bucket_name" {
  description = "Name of the quiz media S3 bucket"
  value       = module.s3.quiz_media_bucket_name
}

output "quiz_media_cloudfront_domain" {
  description = "CloudFront domain for quiz media"
  value       = module.s3.quiz_media_cloudfront_domain
}

output "quiz_media_cloudfront_url" {
  description = "Full CloudFront URL for quiz media"
  value       = module.s3.quiz_media_cloudfront_url
}

output "community_media_bucket_name" {
  description = "Name of the community media S3 bucket"
  value       = module.s3.community_media_bucket_name
}

output "community_media_cloudfront_domain" {
  description = "CloudFront domain for community media"
  value       = module.s3.community_media_cloudfront_domain
}

output "community_media_cloudfront_url" {
  description = "Full CloudFront URL for community media"
  value       = module.s3.community_media_cloudfront_url
}

# Bastion
output "bastion_public_ip" {
  description = "Public IP address of the Bastion Host"
  value       = module.bastion.bastion_public_ip
}

output "bastion_role_arn" {
  description = "IAM Role ARN of the Bastion Host"
  value       = module.bastion.bastion_role_arn
}

# IRSA
output "admin_service_role_arn" {
  description = "ARN of the admin service IAM role"
  value       = module.irsa.admin_service_role_arn
}

# Karpenter
# output "karpenter_controller_role_arn" {
#   description = "ARN of the Karpenter controller IAM role"
#   value       = module.karpenter.karpenter_controller_role_arn
# }
#
# output "karpenter_node_role_name" {
#   description = "Name of the Karpenter node IAM role"
#   value       = module.karpenter.karpenter_node_role_name
# }
#
# output "karpenter_node_instance_profile_name" {
#   description = "Name of the Karpenter node instance profile"
#   value       = module.karpenter.karpenter_node_instance_profile_name
# }

# output "karpenter_queue_name" {
#   description = "Name of the SQS queue for Karpenter"
#   value       = module.karpenter.karpenter_queue_name
# }
