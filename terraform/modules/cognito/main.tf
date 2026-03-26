# ============================================================================
# COGNITO MODULE - User Pool for PawFiler authentication
# ============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_uppercase                = false
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 1
  }

  # email 속성
  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # 계정 복구 (이메일)
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Project = var.project_name
  }
}

# SPA용 App Client (client_secret 없음 — 프론트엔드 직접 호출용)
resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.project_name}-spa-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 6
  id_token_validity      = 6
  refresh_token_validity = 7

  prevent_user_existence_errors = "ENABLED"

  read_attributes  = ["email", "email_verified"]
  write_attributes = ["email"]
}

# 서버 사이드용 App Client (서비스 간 AdminInitiateAuth용)
resource "aws_cognito_user_pool_client" "server" {
  name         = "${var.project_name}-server-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 6
  id_token_validity      = 6
  refresh_token_validity = 7

  prevent_user_existence_errors = "ENABLED"
}

# ===========================================================================
# SSM Parameters — auth 서비스가 IRSA로 읽는 값들
# ===========================================================================

resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name        = "/${var.project_name}/cognito/user_pool_id"
  type        = "String"
  value       = aws_cognito_user_pool.main.id
  description = "Cognito User Pool ID"

  tags = { Project = var.project_name }
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name        = "/${var.project_name}/cognito/client_id"
  type        = "String"
  value       = aws_cognito_user_pool_client.server.id
  description = "Cognito App Client ID (server-side)"

  tags = { Project = var.project_name }
}

resource "aws_ssm_parameter" "cognito_issuer" {
  name        = "/${var.project_name}/cognito/issuer"
  type        = "String"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  description = "Cognito JWT issuer URL (Istio RequestAuthentication용)"

  tags = { Project = var.project_name }
}
