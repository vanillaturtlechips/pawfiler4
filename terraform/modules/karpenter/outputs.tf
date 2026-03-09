output "karpenter_controller_role_arn" {
  description = "ARN of the Karpenter controller IAM role"
  value       = var.enable_karpenter ? aws_iam_role.karpenter_controller[0].arn : null
}

output "karpenter_node_role_name" {
  description = "Name of the Karpenter node IAM role"
  value       = var.enable_karpenter ? aws_iam_role.karpenter_node[0].name : null
}

output "karpenter_node_instance_profile_name" {
  description = "Name of the Karpenter node instance profile"
  value       = var.enable_karpenter ? aws_iam_instance_profile.karpenter_node[0].name : null
}

output "karpenter_queue_name" {
  description = "Name of the SQS queue for Karpenter spot interruption"
  value       = var.enable_karpenter ? aws_sqs_queue.karpenter[0].name : null
}

output "karpenter_queue_arn" {
  description = "ARN of the SQS queue for Karpenter spot interruption"
  value       = var.enable_karpenter ? aws_sqs_queue.karpenter[0].arn : null
}
