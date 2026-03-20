output "alb_controller_role_arn" {
  description = "ARN of the ALB controller IAM role"
  value       = aws_iam_role.alb_controller.arn
}

output "kubecost_role_arn" {
  description = "ARN of the Kubecost IAM role"
  value       = aws_iam_role.kubecost.arn
}

output "cluster_autoscaler_role_arn" {
  description = "ARN of the Cluster Autoscaler IAM role"
  value       = aws_iam_role.cluster_autoscaler.arn
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

output "devops_guru_sns_topic_arn" {
  description = "ARN of the DevOps Guru SNS topic"
  value       = aws_sns_topic.devops_guru.arn
}
