# ============================================================================
# S3 MODULE - Media Storage for Quiz Questions
# ============================================================================
# Architecture:
# - S3 Bucket: pawfiler-quiz-media (private)
# - CloudFront: OAI-based secure access
# - CORS: Allows localhost (dev) + production domains
# - Lifecycle: Auto-delete old versions after 90 days

# S3 Bucket for Quiz Media (Images/Videos)
resource "aws_s3_bucket" "quiz_media" {
  bucket = "${var.project_name}-quiz-media"

  tags = {
    Name        = "${var.project_name}-quiz-media"
    Environment = "production"
    Purpose     = "Quiz question media storage"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access (CloudFront will access via OAI)
resource "aws_s3_bucket_public_access_block" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# CORS configuration for direct uploads (optional)
resource "aws_s3_bucket_cors_configuration" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "https://pawfiler.com",
      "https://dev.pawfiler.com"
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Lifecycle rule to manage old versions
resource "aws_s3_bucket_lifecycle_configuration" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "quiz_media" {
  comment = "OAI for ${var.project_name} quiz media"
}

# S3 bucket policy to allow CloudFront access
resource "aws_s3_bucket_policy" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAI"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.quiz_media.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.quiz_media.arn}/*"
      }
    ]
  })
}

# CloudFront distribution for media
resource "aws_cloudfront_distribution" "quiz_media" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} quiz media CDN"
  default_root_object = ""

  origin {
    domain_name = aws_s3_bucket.quiz_media.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.quiz_media.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.quiz_media.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.quiz_media.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400   # 1 day
    max_ttl                = 31536000 # 1 year
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-quiz-media-cdn"
  }
}

# Outputs
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
