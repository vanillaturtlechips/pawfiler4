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
