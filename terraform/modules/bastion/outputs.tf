output "bastion_public_ip" {
  description = "Public IP address of the Bastion Host"
  value       = aws_instance.bastion.public_ip
}

output "bastion_role_arn" {
  description = "IAM Role ARN of the Bastion Host"
  value       = aws_iam_role.bastion.arn
}

output "bastion_security_group_id" {
  description = "Security group ID of the Bastion Host"
  value       = aws_security_group.bastion.id
}
