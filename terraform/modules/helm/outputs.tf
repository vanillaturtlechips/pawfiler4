output "alb_controller_role_arn" {
  description = "ARN of the ALB controller IAM role"
  value       = aws_iam_role.alb_controller.arn
}

output "kubecost_role_arn" {
  description = "ARN of the Kubecost IAM role"
  value       = aws_iam_role.kubecost.arn
}
