# ============================================================================
# ECR MODULE - Elastic Container Registry Repositories
# ============================================================================
# Architecture:
# - Backend Services: Quiz, Community, Video Analysis, Admin (ECR + EKS)
# - Frontend Services: Frontend, Admin-Frontend (S3 static hosting)
# - Gateway: Envoy (runs in EKS, no separate ECR needed)

resource "aws_ecr_repository" "quiz_service" {
  name = "${var.project_name}/quiz-service"
  tags = { Name = "${var.project_name}-quiz-ecr" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "community_service" {
  name = "${var.project_name}/community-service"
  tags = { Name = "${var.project_name}-community-ecr" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "video_analysis_service" {
  name = "${var.project_name}/video-analysis-service"
  tags = { Name = "${var.project_name}-video-analysis-ecr" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "admin_service" {
  name = "${var.project_name}/admin-service"
  tags = { Name = "${var.project_name}-admin-ecr" }

  lifecycle {
    prevent_destroy = true
  }
}
