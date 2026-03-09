# ============================================================================
# IRSA for Admin Service
# ============================================================================

# IAM Role for Admin Service
resource "aws_iam_role" "admin_service" {
  name = "${var.project_name}-admin-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:admin:admin-service"
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# S3 Access Policy
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
        aws_s3_bucket.quiz_media.arn,
        "${aws_s3_bucket.quiz_media.arn}/*"
      ]
    }]
  })
}

output "admin_service_role_arn" {
  value = aws_iam_role.admin_service.arn
}
