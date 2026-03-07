# ============================================================================
# S3 + CloudFront for Frontend Static Hosting
# ============================================================================
# Architecture:
# - Frontend: Public S3 + CloudFront (for end users)
# - Admin Frontend: Public S3 only (Bastion IP restriction planned, currently public for testing)

# Frontend S3 Bucket
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend"
  tags   = { Name = "${var.project_name}-frontend" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Frontend CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  aliases             = ["pawfiler.site", "www.pawfiler.site"]

  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.frontend.id}"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = "arn:aws:acm:us-east-1:009946608368:certificate/ca05925f-18e9-44c3-939e-394dfedb3784"
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.project_name}-frontend-cdn" }
}

# Admin Frontend S3 Bucket
resource "aws_s3_bucket" "admin_frontend" {
  bucket = "${var.project_name}-admin-frontend"
  tags   = { Name = "${var.project_name}-admin-frontend" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_website_configuration" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.admin_frontend.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.admin_frontend]
}

# Admin Frontend CloudFront - Removed (Bastion-only access)

# Outputs
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
