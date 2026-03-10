output "ecr_repository_urls" {
  description = "Map of ECR repository URLs for application services"
  value = {
    quiz_service           = aws_ecr_repository.quiz_service.repository_url
    community_service      = aws_ecr_repository.community_service.repository_url
    video_analysis_service = aws_ecr_repository.video_analysis_service.repository_url
    admin_service          = aws_ecr_repository.admin_service.repository_url
  }
}
