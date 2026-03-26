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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:${var.project_name}:community-service-sa"
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

# ============================================================================
# IAM Role for AI Agent Service (Bedrock 챗봇)
# ============================================================================

resource "aws_iam_role" "ai_agent_service" {
  name = "${var.project_name}-ai-agent-service-role"

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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:${var.project_name}:ai-agent-service-sa"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# Bedrock InvokeModel Policy for AI Agent Service
resource "aws_iam_role_policy" "ai_agent_bedrock" {
  name = "bedrock-access"
  role = aws_iam_role.ai_agent_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:*:inference-profile/*"
      ]
    }]
  })
}

# ============================================================================
# IAM Role for Auth Service (Cognito 관리 + SSM 파라미터 읽기)
# ============================================================================

resource "aws_iam_role" "auth_service" {
  name = "${var.project_name}-auth-service-role"

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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:pawfiler:auth-service-sa"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "auth_service_cognito" {
  name = "cognito-access"
  role = aws_iam_role.auth_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:InitiateAuth",
          "cognito-idp:GlobalSignOut",
          "cognito-idp:GetUser"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:aws:ssm:*:*:parameter/${var.project_name}/cognito/*"
      }
    ]
  })
}

# ============================================================================
# IAM Role for Loki (S3 청크 저장)
# ============================================================================

resource "aws_iam_role" "loki" {
  name = "${var.project_name}-loki-role"

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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:monitoring:loki"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "loki_s3" {
  name = "s3-access"
  role = aws_iam_role.loki.id

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
        var.loki_chunks_bucket_arn,
        "${var.loki_chunks_bucket_arn}/*"
      ]
    }]
  })
}
