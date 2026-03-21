# ============================================================================
# AIOps 4단계: EventBridge → Lambda 자동 대응
# DevOps Guru 인사이트 감지 → SNS 알림 + HIGH severity 자동 대응
# ============================================================================

# ---------------------------------------------------------------------------
# Lambda 코드 패키징
# ---------------------------------------------------------------------------
data "archive_file" "auto_remediation" {
  type        = "zip"
  source_file = "${path.module}/../../../lambda/auto_remediation/main.py"
  output_path = "${path.module}/../../../lambda/auto_remediation/auto_remediation.zip"
}

# ---------------------------------------------------------------------------
# Lambda IAM Role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "auto_remediation" {
  name = "${var.project_name}-auto-remediation"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = {
    Project = var.project_name
    Purpose = "aiops"
  }
}

resource "aws_iam_role_policy" "auto_remediation" {
  name = "${var.project_name}-auto-remediation-policy"
  role = aws_iam_role.auto_remediation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.devops_guru.arn
      },
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "devops-guru:GetInsight",
          "devops-guru:ListAnomaliesForInsight"
        ]
        Resource = "*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda 함수
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "auto_remediation" {
  filename         = data.archive_file.auto_remediation.output_path
  function_name    = "${var.project_name}-auto-remediation"
  role             = aws_iam_role.auto_remediation.arn
  handler          = "main.lambda_handler"
  runtime          = "python3.12"
  source_code_hash = data.archive_file.auto_remediation.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      SNS_TOPIC_ARN = aws_sns_topic.devops_guru.arn
      CLUSTER_NAME  = var.cluster_name
    }
  }

  tags = {
    Project = var.project_name
    Purpose = "aiops"
  }
}

# ---------------------------------------------------------------------------
# EventBridge Rule - DevOps Guru 이벤트 감지
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "devops_guru" {
  name        = "${var.project_name}-devops-guru-insights"
  description = "DevOps Guru 신규 인사이트 감지 → Lambda 자동 대응"

  event_pattern = jsonencode({
    source      = ["aws.devops-guru"]
    detail-type = ["DevOps Guru New Insight Open"]
  })

  tags = {
    Project = var.project_name
    Purpose = "aiops"
  }
}

resource "aws_cloudwatch_event_target" "auto_remediation" {
  rule = aws_cloudwatch_event_rule.devops_guru.name
  arn  = aws_lambda_function.auto_remediation.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_remediation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.devops_guru.arn
}
