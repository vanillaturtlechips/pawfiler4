output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_node_group_arn" {
  description = "The ARN of the EKS node group"
  value       = aws_eks_node_group.main.arn
}

output "rds_instance_address" {
  description = "The address of the RDS instance"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "rds_instance_port" {
  description = "The port of the RDS instance"
  value       = aws_db_instance.main.port
}

output "msk_bootstrap_brokers_tls" {
  description = "The TLS bootstrap brokers string for the MSK cluster"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
  sensitive   = true
}

output "ecr_repository_urls" {
  description = "Map of ECR repository URLs for application services"
  value = {
    auth_service           = aws_ecr_repository.auth_service.repository_url
    community_service      = aws_ecr_repository.community_service.repository_url
    payment_service        = aws_ecr_repository.payment_service.repository_url
    quiz_service           = aws_ecr_repository.quiz_service.repository_url
    video_analysis_service = aws_ecr_repository.video_analysis_service.repository_url
    dashboard_bff          = aws_ecr_repository.dashboard_bff.repository_url
    envoy_proxy            = aws_ecr_repository.envoy_proxy.repository_url
  }
}

output "bastion_public_ip" {
  description = "Public IP address of the Bastion Host"
  value       = aws_instance.bastion.public_ip
}
