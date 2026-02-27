# ============================================================================
# ECR MODULE - Elastic Container Registry Repositories
# ============================================================================

resource "aws_ecr_repository" "auth_service" {
  name = "${var.project_name}/auth-service"
  tags = { Name = "${var.project_name}-auth-ecr" }
}

resource "aws_ecr_repository" "community_service" {
  name = "${var.project_name}/community-service"
  tags = { Name = "${var.project_name}-community-ecr" }
}

resource "aws_ecr_repository" "payment_service" {
  name = "${var.project_name}/payment-service"
  tags = { Name = "${var.project_name}-payment-ecr" }
}

resource "aws_ecr_repository" "quiz_service" {
  name = "${var.project_name}/quiz-service"
  tags = { Name = "${var.project_name}-quiz-ecr" }
}

resource "aws_ecr_repository" "video_analysis_service" {
  name = "${var.project_name}/video-analysis-service"
  tags = { Name = "${var.project_name}-video-analysis-ecr" }
}

resource "aws_ecr_repository" "dashboard_bff" {
  name = "${var.project_name}/dashboard-bff"
  tags = { Name = "${var.project_name}-dashboard-bff-ecr" }
}

resource "aws_ecr_repository" "envoy_proxy" {
  name = "${var.project_name}/envoy-proxy"
  tags = { Name = "${var.project_name}-envoy-proxy-ecr" }
}

output "ecr_repository_urls" {
  description = "Map of ECR repository URLs for application services"
  value = {
    auth_service           = aws_ecr_repository.auth_service.repository_url
    community_service      = aws_ecr_repository.community_service.repository_url
    payment_service        = aws_ecr_repository.payment_service.repository_url
    quiz_service           = aws_ecr_repository.quiz_service.repository_url
    video_analysis_service = aws_ecr_repository.video_analysis_service.repository_url
    dashboard_bff          = aws_ecr_repository.dashboard_bff.repository_url
    envoy_proxy            = aws_ecr_repository.envoy_proxy.repository_url
  }
}
