# ============================================================================
# LAMBDA REPORT MODULE - Outputs
# ============================================================================

output "report_bucket_name" {
  description = "S3 bucket name for report HTML files"
  value       = aws_s3_bucket.reports.id
}

output "report_bucket_arn" {
  description = "S3 bucket ARN for report HTML files"
  value       = aws_s3_bucket.reports.arn
}

output "report_lambda_arn" {
  description = "ARN of the report Lambda function"
  value       = aws_lambda_function.report.arn
}

output "report_lambda_name" {
  description = "Name of the report Lambda function"
  value       = aws_lambda_function.report.function_name
}

output "report_function_url" {
  description = "API Gateway HTTP API URL (set as VITE_REPORT_BASE_URL in frontend)"
  value       = aws_apigatewayv2_stage.report.invoke_url
}

output "report_ecr_repository_url" {
  description = "ECR repository URL for report Lambda image"
  value       = aws_ecr_repository.report_lambda.repository_url
}

output "report_sqs_queue_url" {
  description = "SQS queue URL for async report jobs"
  value       = aws_sqs_queue.report_jobs.url
}

output "report_sqs_queue_arn" {
  description = "SQS queue ARN for async report jobs"
  value       = aws_sqs_queue.report_jobs.arn
}
