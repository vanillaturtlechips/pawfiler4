# ============================================================================
# Envoy IRSA - IAM Role for Envoy to access S3 (proto.pb)
# ============================================================================

resource "aws_iam_role" "envoy_s3_role" {
  name = "${var.project_name}-envoy-s3-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:test-ns:envoy-sa"
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "envoy_s3_policy" {
  name = "${var.project_name}-envoy-s3-policy"
  role = aws_iam_role.envoy_s3_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "arn:aws:s3:::${var.project_name}-quiz-media/config/proto.pb"
    }]
  })
}

output "envoy_s3_role_arn" {
  description = "ARN of the Envoy S3 IRSA role"
  value       = aws_iam_role.envoy_s3_role.arn
}
