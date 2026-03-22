output "alb_controller_role_arn" {
  description = "ARN of the ALB controller IAM role"
  value       = aws_iam_role.alb_controller.arn
}

output "kubecost_role_arn" {
  description = "ARN of the Kubecost IAM role"
  value       = aws_iam_role.kubecost.arn
}

output "amp_workspace_id" {
  description = "AMP workspace ID"
  value       = aws_prometheus_workspace.main.id
}

output "amp_endpoint" {
  description = "AMP workspace endpoint"
  value       = aws_prometheus_workspace.main.prometheus_endpoint
}

output "prometheus_amp_role_arn" {
  description = "ARN of the Prometheus IRSA role for AMP remote_write"
  value       = aws_iam_role.prometheus_amp.arn
}

output "grafana_amp_role_arn" {
  description = "ARN of the Grafana IRSA role for AMP query"
  value       = aws_iam_role.grafana_amp.arn
}

output "aiops_sns_topic_arn" {
  description = "ARN of the AIOps SNS topic"
  value       = aws_sns_topic.aiops.arn
}

output "aiops_role_arn" {
  description = "ARN of the AIOps IRSA role"
  value       = aws_iam_role.aiops.arn
}
