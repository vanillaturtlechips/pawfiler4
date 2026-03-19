# ============================================================================
# LAMBDA REPORT MODULE
# - S3 버킷 (리포트 HTML 저장, 1일 lifecycle)
# - SQS 큐 + DLQ (비동기 처리 대비)
# - ECR 리포지토리 (Lambda 컨테이너 이미지)
# - Lambda 함수 (컨테이너 이미지, VPC 내 실행 → RDS 접근)
# - Lambda Function URL (CORS 허용, 프론트엔드 직접 호출)
# - IAM 실행 역할
# - Lambda 전용 Security Group
# ============================================================================

# ── S3: 리포트 저장 버킷 ──────────────────────────────────────────────────────

resource "aws_s3_bucket" "reports" {
  bucket = "${var.project_name}-reports"
  tags   = { Name = "${var.project_name}-reports" }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 1일 후 자동 삭제 (presigned URL 1시간 만료 기준, S3 lifecycle 최소 단위 = 1일)
resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "delete-after-1-day"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }
  }
}

# ── ECR: Lambda 컨테이너 이미지 리포지토리 ────────────────────────────────────
# 기존 pawfiler/quiz-service 등과 동일한 패턴으로 생성

resource "aws_ecr_repository" "report_lambda" {
  name = "${var.project_name}/report-lambda"
  tags = { Name = "${var.project_name}-report-lambda-ecr" }

  image_scanning_configuration {
    scan_on_push = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# 이미지 최대 5개 유지
resource "aws_ecr_lifecycle_policy" "report_lambda" {
  repository = aws_ecr_repository.report_lambda.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ── SQS: 비동기 처리 큐 ───────────────────────────────────────────────────────

resource "aws_sqs_queue" "report_dlq" {
  name                      = "${var.project_name}-report-jobs-dlq"
  message_retention_seconds = 86400 # 1일
  tags                      = { Name = "${var.project_name}-report-dlq" }
}

resource "aws_sqs_queue" "report_jobs" {
  name                       = "${var.project_name}-report-jobs"
  visibility_timeout_seconds = 360  # Lambda timeout(300s) + 여유(60s)
  message_retention_seconds  = 3600 # 1시간
  tags                       = { Name = "${var.project_name}-report-jobs" }

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_dlq.arn
    maxReceiveCount     = 2 # 2회 실패 시 DLQ로
  })
}

# ── Security Group: Lambda 전용 ───────────────────────────────────────────────

resource "aws_security_group" "lambda_report" {
  name        = "${var.project_name}-lambda-report-sg"
  description = "Security group for report Lambda - allows outbound to RDS and internet (NAT)"
  vpc_id      = var.vpc_id

  # 아웃바운드 전체 허용 (NAT Gateway 통해 S3/SQS API 호출, RDS 접근)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-lambda-report-sg" }
}

# RDS SG에 Lambda SG로부터의 5432 인바운드 허용
resource "aws_security_group_rule" "rds_allow_lambda" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda_report.id
  security_group_id        = var.rds_security_group_id
  description              = "Allow PostgreSQL from report Lambda"
}

# ── IAM: Lambda 실행 역할 ─────────────────────────────────────────────────────

resource "aws_iam_role" "report_lambda" {
  name = "${var.project_name}-report-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# VPC 내 실행을 위한 ENI 생성 권한 포함
resource "aws_iam_role_policy_attachment" "report_lambda_vpc" {
  role       = aws_iam_role.report_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "report_lambda_custom" {
  name = "${var.project_name}-report-lambda-policy"
  role = aws_iam_role.report_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # S3: 리포트 버킷 읽기/쓰기
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = [
          aws_s3_bucket.reports.arn,
          "${aws_s3_bucket.reports.arn}/*"
        ]
      },
      # SQS: 큐 메시지 처리
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.report_jobs.arn,
          aws_sqs_queue.report_dlq.arn
        ]
      }
    ]
  })
}

# ── Lambda 함수 ───────────────────────────────────────────────────────────────

locals {
  # ecr_image_uri가 비어있으면 ECR 리포지토리 URL:latest 사용
  # 첫 apply 순서: ECR 생성 → 이미지 push → Lambda apply
  image_uri = var.ecr_image_uri != "" ? var.ecr_image_uri : "${aws_ecr_repository.report_lambda.repository_url}:latest"
}

resource "aws_lambda_function" "report" {
  function_name = "${var.project_name}-report"
  role          = aws_iam_role.report_lambda.arn
  package_type  = "Image"
  image_uri     = local.image_uri

  timeout     = var.lambda_timeout
  memory_size = var.lambda_memory

  # SQS/Function URL 모두 main.lambda_handler 단일 진입점으로 처리
  image_config {
    command = ["main.lambda_handler"]
  }

  # VPC 내 실행 → private subnet에서 RDS(Proxy) 직접 접근
  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_report.id]
  }

  environment {
    variables = {
      DATABASE_URL     = var.database_url
      REPORT_S3_BUCKET = aws_s3_bucket.reports.id
      REPORT_S3_PREFIX = "reports"
    }
  }

  tags = { Name = "${var.project_name}-report-lambda" }

  # 이미지 URI는 CI/CD(aws lambda update-function-code)로 관리
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [aws_iam_role_policy_attachment.report_lambda_vpc]
}

# ── API Gateway HTTP API ──────────────────────────────────────────────────────
# Function URL 대체 — SCP 환경에서 lambda:InvokeFunctionUrl 차단 우회

resource "aws_apigatewayv2_api" "report" {
  name          = "${var.project_name}-report-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }
}

resource "aws_apigatewayv2_integration" "report" {
  api_id                 = aws_apigatewayv2_api.report.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.report.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "report_post" {
  api_id    = aws_apigatewayv2_api.report.id
  route_key = "POST /generate"
  target    = "integrations/${aws_apigatewayv2_integration.report.id}"
}

resource "aws_apigatewayv2_route" "report_get" {
  api_id    = aws_apigatewayv2_api.report.id
  route_key = "GET /generate"
  target    = "integrations/${aws_apigatewayv2_integration.report.id}"
}

resource "aws_apigatewayv2_stage" "report" {
  api_id      = aws_apigatewayv2_api.report.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "report_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.report.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.report.execution_arn}/*/*"
}

# ── SQS → Lambda 이벤트 소스 매핑 ────────────────────────────────────────────

resource "aws_lambda_event_source_mapping" "report_sqs" {
  event_source_arn        = aws_sqs_queue.report_jobs.arn
  function_name           = aws_lambda_function.report.arn
  batch_size              = 1 # 리포트 생성은 무거우므로 1건씩
  enabled                 = true
  function_response_types = ["ReportBatchItemFailures"]
}
