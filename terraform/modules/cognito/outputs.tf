output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "spa_client_id" {
  description = "SPA App Client ID (frontend용)"
  value       = aws_cognito_user_pool_client.spa.id
}

output "server_client_id" {
  description = "Server App Client ID (auth 서비스용)"
  value       = aws_cognito_user_pool_client.server.id
}

output "issuer" {
  description = "JWT issuer URL (Istio RequestAuthentication용)"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "jwks_uri" {
  description = "JWKS URI (Istio RequestAuthentication용)"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}
