# ============================================================================
# HELM MODULE - Helm Releases and associated IAM roles (IRSA)
# Includes: ALB Controller, ArgoCD, Kubecost, Grafana, Envoy, Metrics Server, Karpenter
# ============================================================================

# ===========================================================================
# ALB Controller IAM Role (IRSA)
# ===========================================================================

resource "aws_iam_role" "alb_controller" {
  name = "${var.project_name}-alb-controller"

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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  policy_arn = "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess"
  role       = aws_iam_role.alb_controller.name
}

resource "aws_iam_role_policy_attachment" "alb_controller_ec2" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2FullAccess"
  role       = aws_iam_role.alb_controller.name
}

resource "aws_iam_role_policy" "alb_controller_waf" {
  name = "${var.project_name}-alb-controller-waf"
  role = aws_iam_role.alb_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL",
          "waf-regional:GetWebACLForResource",
          "shield:GetSubscriptionState"
        ]
        Resource = "*"
      }
    ]
  })
}

# ===========================================================================
# Kubecost IAM Role (IRSA)
# ===========================================================================

resource "aws_iam_role" "kubecost" {
  name = "${var.project_name}-kubecost"

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
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:monitoring:kubecost-cost-analyzer"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "kubecost" {
  name = "${var.project_name}-kubecost-policy"
  role = aws_iam_role.kubecost.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetCostForecast",
          "ce:GetDimensionValues",
          "ce:GetTags",
          "ec2:DescribeInstances",
          "ec2:DescribeRegions",
          "ec2:DescribeVolumes",
          "ec2:DescribeSnapshots",
          "ec2:DescribeSpotPriceHistory",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = "*"
      }
    ]
  })
}

# ===========================================================================
# Helm Releases
# ===========================================================================

# AWS Load Balancer Controller (Gateway API 지원)
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.8.0"

  set {
    name  = "clusterName"
    value = var.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller.arn
  }

  set {
    name  = "enableGatewayAPI"
    value = "true"
  }

  set {
    name  = "vpcId"
    value = var.vpc_id
  }

}

# ArgoCD 설치
resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  namespace        = "argocd"
  create_namespace = true
  version          = "7.0.0"

  values = [
    yamlencode({
      server = {
        service = {
          type = "ClusterIP"
        }
        extraArgs = [
          "--insecure"
        ]
      }
    })
  ]

}

# Kubecost 설치 (비용 모니터링)
# - 번들 Prometheus/Grafana 비활성화
# - 외부 Prometheus: kube-prometheus-stack (AMP remote_write 담당)
# - IRSA: CE/EC2/CloudWatch 비용 데이터 조회
resource "helm_release" "kubecost" {
  name             = "kubecost"
  repository       = "oci://public.ecr.aws/kubecost"
  chart            = "cost-analyzer"
  namespace        = "monitoring"
  create_namespace = true
  version          = "2.4.0"
  timeout          = 600
  wait             = false

  # Kubecost 라이선스 토큰
  set {
    name  = "kubecostToken"
    value = var.kubecost_token
  }

  # AWS 비용 데이터 연동
  set {
    name  = "kubecostProductConfigs.clusterName"
    value = var.cluster_name
  }

  set {
    name  = "kubecostProductConfigs.awsSpotDataRegion"
    value = var.aws_region
  }

  # IRSA ServiceAccount
  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "kubecost-cost-analyzer"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.kubecost.arn
  }

  # Kubecost 자체 PV (cost-analyzer 데이터)
  set {
    name  = "persistentVolume.storageClass"
    value = "gp2"
  }

  # 번들 Grafana 비활성화 (standalone Grafana 사용)
  set {
    name  = "grafana.enabled"
    value = "false"
  }

  # 번들 Prometheus 비활성화 → kube-prometheus-stack으로 통합
  set {
    name  = "global.prometheus.enabled"
    value = "false"
  }

  # 외부 Prometheus 엔드포인트 (kube-prometheus-stack)
  set {
    name  = "global.prometheus.fqdn"
    value = "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090"
  }

}


# Envoy Gateway - Istio 서비스 메시로 전환하여 제거 (istio.tf로 이동)
# Istio 설정은 istio.tf 참조

# Metrics Server (HPA용)
resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.0"
}

# ---------------------------------------------------------------------------
# Cluster Autoscaler (Karpenter로 전환, 비활성화)
# resource "helm_release" "cluster_autoscaler" {
#   name             = "cluster-autoscaler"
#   repository       = "https://kubernetes.github.io/autoscaler"
#   chart            = "cluster-autoscaler"
#   namespace        = "kube-system"
#   create_namespace = false
#   version          = "9.37.0"
#   timeout          = 600
#   wait             = false
#
#   set {
#     name  = "autoDiscovery.clusterName"
#     value = var.cluster_name
#   }
#
#   set {
#     name  = "awsRegion"
#     value = var.aws_region
#   }
#
#   set {
#     name  = "rbac.serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
#     value = aws_iam_role.cluster_autoscaler.arn
#   }
#
#   set {
#     name  = "rbac.serviceAccount.name"
#     value = "cluster-autoscaler"
#   }
#
#   set {
#     name  = "extraArgs.balance-similar-node-groups"
#     value = "true"
#   }
#
#   set {
#     name  = "extraArgs.skip-nodes-with-system-pods"
#     value = "false"
#   }
#
#   depends_on = [
#     helm_release.metrics_server
#   ]
# }

# Cluster Autoscaler IAM Role 제거됨 (Karpenter로 전환 완료)

# Karpenter (자동 스케일링)
resource "helm_release" "karpenter" {
  count            = var.enable_karpenter ? 1 : 0
  name             = "karpenter"
  repository       = "oci://public.ecr.aws/karpenter"
  chart            = "karpenter"
  namespace        = "karpenter"
  create_namespace = true
  version          = "1.3.3"

  set {
    name  = "settings.clusterName"
    value = var.cluster_name
  }

  set {
    name  = "settings.clusterEndpoint"
    value = var.cluster_endpoint
  }

  set {
    name  = "settings.interruptionQueue"
    value = var.karpenter_queue_name
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = var.karpenter_controller_role_arn
  }

  set {
    name  = "controller.resources.requests.cpu"
    value = "100m"
  }

  set {
    name  = "controller.resources.requests.memory"
    value = "256Mi"
  }

  set {
    name  = "controller.resources.limits.cpu"
    value = "500m"
  }

  set {
    name  = "controller.resources.limits.memory"
    value = "512Mi"
  }

  depends_on = [helm_release.metrics_server]
}
