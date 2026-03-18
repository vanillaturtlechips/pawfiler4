output "admin_service_role_arn" {
  description = "ARN of the admin service IAM role"
  value       = aws_iam_role.admin_service.arn
}

output "community_service_role_arn" {
  description = "ARN of the community service IAM role"
  value       = aws_iam_role.community_service.arn
}
