# ============================================================================
# S3 MODULE - Frontend, Admin Frontend, and Quiz Media Storage
# ============================================================================
# Architecture:
# - Frontend: Public S3 + CloudFront (for end users)
# - Admin Frontend: Public S3 only (Bastion IP restriction planned)
# - Quiz Media: Private S3 + CloudFront OAI (for quiz question media)

# ===========================================================================
# Frontend S3 + CloudFront
# ===========================================================================

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

  origin {
    domain_name = var.envoy_alb_domain
    origin_id   = "API-Backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "API-Backend"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
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

# ===========================================================================
# Admin Frontend S3 (public, Bastion-only access planned)
# ===========================================================================

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

# ===========================================================================
# Quiz Media S3 + CloudFront (OAI-based secure access)
# ===========================================================================

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
    default_ttl            = 86400    # 1 day
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

# ===========================================================================
# Community Media S3 + CloudFront (for user-uploaded content)
# ===========================================================================

resource "aws_s3_bucket" "community_media" {
  bucket = "${var.project_name}-community-media"

  tags = {
    Name        = "${var.project_name}-community-media"
    Environment = "production"
    Purpose     = "Community post media storage"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "community_media" {
  bucket = aws_s3_bucket.community_media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access (CloudFront will access via OAI)
resource "aws_s3_bucket_public_access_block" "community_media" {
  bucket = aws_s3_bucket.community_media.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# CORS configuration for direct uploads
resource "aws_s3_bucket_cors_configuration" "community_media" {
  bucket = aws_s3_bucket.community_media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "https://pawfiler.site",
      "https://www.pawfiler.site"
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Lifecycle rule to manage old versions
resource "aws_s3_bucket_lifecycle_configuration" "community_media" {
  bucket = aws_s3_bucket.community_media.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "community_media" {
  comment = "OAI for ${var.project_name} community media"
}

# S3 bucket policy to allow CloudFront access
resource "aws_s3_bucket_policy" "community_media" {
  bucket = aws_s3_bucket.community_media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAI"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.community_media.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.community_media.arn}/*"
      }
    ]
  })
}

# CloudFront distribution for community media
resource "aws_cloudfront_distribution" "community_media" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} community media CDN"
  default_root_object = ""

  origin {
    domain_name = aws_s3_bucket.community_media.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.community_media.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.community_media.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.community_media.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400    # 1 day
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
    Name = "${var.project_name}-community-media-cdn"
  }
}
