# ============================================================================
# AIOps - AMP Workspace + IRSA (Helm은 ArgoCD로 관리)
# ============================================================================

# ---------------------------------------------------------------------------
# AMP Workspace
# ---------------------------------------------------------------------------
resource "aws_prometheus_workspace" "main" {
  alias = "${var.project_name}-amp"

  tags = {
    Project = var.project_name
    Purpose = "aiops"
  }
}

# ---------------------------------------------------------------------------
# IRSA: Prometheus → AMP remote_write
# ---------------------------------------------------------------------------
resource "aws_iam_role" "prometheus_amp" {
  name = "${var.project_name}-prometheus-amp"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:monitoring:prometheus-server"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "prometheus_amp" {
  name = "${var.project_name}-prometheus-amp-policy"
  role = aws_iam_role.prometheus_amp.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "aps:RemoteWrite",
          "aps:GetSeries",
          "aps:GetLabels",
          "aps:GetMetricMetadata"
        ]
        Resource = aws_prometheus_workspace.main.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# IRSA: Grafana → AMP query
# ---------------------------------------------------------------------------
resource "aws_iam_role" "grafana_amp" {
  name = "${var.project_name}-grafana-amp"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:monitoring:grafana"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "grafana_amp" {
  name = "${var.project_name}-grafana-amp-policy"
  role = aws_iam_role.grafana_amp.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "aps:QueryMetrics",
          "aps:GetSeries",
          "aps:GetLabels",
          "aps:GetMetricMetadata"
        ]
        Resource = aws_prometheus_workspace.main.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# IRSA: OTEL Collector → CloudWatch Logs + X-Ray
# ---------------------------------------------------------------------------
resource "aws_iam_role" "otel_collector" {
  name = "${var.project_name}-otel-collector"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:monitoring:otel-collector"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "otel_collector" {
  name = "${var.project_name}-otel-collector-policy"
  role = aws_iam_role.otel_collector.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:ap-northeast-2:009946608368:log-group:/aws/eks/pawfiler-eks-cluster/*"
      },
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        Resource = "*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# DevOps Guru - 이상 탐지 및 운영 인사이트
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "devops_guru" {
  name = "${var.project_name}-devops-guru"

  tags = {
    Project = var.project_name
    Purpose = "aiops"
  }
}

resource "aws_devopsguru_resource_collection" "main" {
  type = "AWS_TAGS"

  tags {
    app_boundary_key = "Project"
    tag_values       = [var.project_name]
  }
}

resource "aws_devopsguru_notification_channel" "main" {
  sns {
    topic_arn = aws_sns_topic.devops_guru.arn
  }
}
