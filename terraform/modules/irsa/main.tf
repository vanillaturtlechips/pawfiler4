# ============================================================================
# IRSA MODULE - IAM Roles for Service Accounts
# Admin Service: S3 access for quiz media
# ============================================================================

# IAM Role for Admin Service
resource "aws_iam_role" "admin_service" {
  name = "${var.project_name}-admin-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:admin:admin-service"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# S3 Access Policy for Admin Service
resource "aws_iam_role_policy" "admin_service_s3" {
  name = "s3-access"
  role = aws_iam_role.admin_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        var.quiz_media_bucket_arn,
        "${var.quiz_media_bucket_arn}/*"
      ]
    }]
  })
}

# IAM Role for Community Service
resource "aws_iam_role" "community_service" {
  name = "${var.project_name}-community-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:pawfiler:community-service-sa"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# S3 Access Policy for Community Service
resource "aws_iam_role_policy" "community_service_s3" {
  name = "s3-access"
  role = aws_iam_role.community_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        var.community_media_bucket_arn,
        "${var.community_media_bucket_arn}/*"
      ]
    }]
  })
}
