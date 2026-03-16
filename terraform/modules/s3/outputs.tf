output "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_cloudfront_url" {
  description = "Frontend CloudFront distribution URL"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "admin_frontend_bucket_name" {
  description = "Admin Frontend S3 bucket name"
  value       = aws_s3_bucket.admin_frontend.id
}

output "admin_frontend_s3_website_url" {
  description = "Admin Frontend S3 website URL (Bastion-only access)"
  value       = aws_s3_bucket_website_configuration.admin_frontend.website_endpoint
}

output "quiz_media_bucket_name" {
  description = "Name of the quiz media S3 bucket"
  value       = aws_s3_bucket.quiz_media.id
}

output "quiz_media_bucket_arn" {
  description = "ARN of the quiz media S3 bucket"
  value       = aws_s3_bucket.quiz_media.arn
}

output "quiz_media_cloudfront_domain" {
  description = "CloudFront domain for quiz media"
  value       = aws_cloudfront_distribution.quiz_media.domain_name
}

output "quiz_media_cloudfront_url" {
  description = "Full CloudFront URL for quiz media"
  value       = "https://${aws_cloudfront_distribution.quiz_media.domain_name}"
}

output "community_media_bucket_name" {
  description = "Name of the community media S3 bucket"
  value       = aws_s3_bucket.community_media.id
}

output "community_media_bucket_arn" {
  description = "ARN of the community media S3 bucket"
  value       = aws_s3_bucket.community_media.arn
}

output "community_media_cloudfront_domain" {
  description = "CloudFront domain for community media"
  value       = aws_cloudfront_distribution.community_media.domain_name
}

output "community_media_cloudfront_url" {
  description = "Full CloudFront URL for community media"
  value       = "https://${aws_cloudfront_distribution.community_media.domain_name}"
}
