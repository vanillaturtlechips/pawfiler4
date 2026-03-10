# ============================================================================
# HELM MODULE - Helm Releases and associated IAM roles (IRSA)
# Includes: ALB Controller, ArgoCD, Kubecost, Grafana, Envoy, Metrics Server, Karpenter
# ============================================================================

terraform {
  required_providers {
    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "~> 1.14"
    }
  }
}

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
          type = "LoadBalancer"
        }
        extraArgs = [
          "--insecure"
        ]
      }
    })
  ]

}

# Kubecost 설치 (비용 모니터링)
resource "helm_release" "kubecost" {
  name             = "kubecost"
  repository       = "oci://public.ecr.aws/kubecost"
  chart            = "cost-analyzer"
  namespace        = "monitoring"
  create_namespace = true
  version          = "2.4.0"
  timeout          = 600
  wait             = false

  set {
    name  = "kubecostToken"
    value = var.kubecost_token
  }

  set {
    name  = "prometheus.server.global.external_labels.cluster_id"
    value = var.cluster_name
  }

  # AWS Cloud Integration
  set {
    name  = "kubecostProductConfigs.clusterName"
    value = var.cluster_name
  }

  set {
    name  = "kubecostProductConfigs.awsSpotDataRegion"
    value = var.aws_region
  }

  set {
    name  = "kubecostProductConfigs.awsSpotDataBucket"
    value = "s3://spot-data-feed-${var.account_id}"
  }

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

  set {
    name  = "persistentVolume.storageClass"
    value = "gp2"
  }

  set {
    name  = "prometheus.server.persistentVolume.storageClass"
    value = "gp2"
  }

  set {
    name  = "prometheus.server.image.repository"
    value = "quay.io/prometheus/prometheus"
  }

  set {
    name  = "prometheus.server.image.tag"
    value = "v2.47.0"
  }

  # Grafana 비활성화 (별도 설치)
  set {
    name  = "grafana.enabled"
    value = "false"
  }

}

# Prometheus 설치 (독립 설치)
resource "helm_release" "prometheus" {
  name             = "prometheus"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "prometheus"
  namespace        = "monitoring"
  create_namespace = true
  version          = "25.8.0"

  set {
    name  = "server.persistentVolume.storageClass"
    value = "gp2"
  }

  set {
    name  = "server.persistentVolume.size"
    value = "32Gi"
  }

  set {
    name  = "alertmanager.enabled"
    value = "false"
  }

  set {
    name  = "prometheus-pushgateway.enabled"
    value = "false"
  }

  set {
    name  = "kube-state-metrics.enabled"
    value = "true"
  }

  set {
    name  = "prometheus-node-exporter.enabled"
    value = "true"
  }

}

# Grafana 설치 (리소스 모니터링 대시보드)
resource "helm_release" "grafana" {
  name             = "grafana"
  repository       = "https://grafana.github.io/helm-charts"
  chart            = "grafana"
  namespace        = "monitoring"
  create_namespace = true
  version          = "7.0.0"

  values = [
    yamlencode({
      adminPassword = "admin"
      persistence = {
        enabled      = true
        storageClass = "gp2"
        size         = "10Gi"
      }
      datasources = {
        "datasources.yaml" = {
          apiVersion = 1
          datasources = [
            {
              name      = "Prometheus"
              type      = "prometheus"
              url       = "http://prometheus-server.monitoring.svc.cluster.local"
              access    = "proxy"
              isDefault = true
            }
          ]
        }
      }
      dashboardProviders = {
        "dashboardproviders.yaml" = {
          apiVersion = 1
          providers = [
            {
              name            = "default"
              orgId           = 1
              folder          = ""
              type            = "file"
              disableDeletion = false
              editable        = true
              options = {
                path = "/var/lib/grafana/dashboards/default"
              }
            }
          ]
        }
      }
      dashboards = {
        default = {
          node-exporter-full = {
            gnetId     = 1860
            revision   = 31
            datasource = "Prometheus"
          }
          kubernetes-cluster = {
            gnetId     = 7249
            revision   = 1
            datasource = "Prometheus"
          }
          kubernetes-pods = {
            gnetId     = 6417
            revision   = 1
            datasource = "Prometheus"
          }
        }
      }
      service = {
        type = "ClusterIP"
        port = 80
      }
    })
  ]

  depends_on = [
    helm_release.prometheus
  ]
}

# Envoy Gateway
resource "helm_release" "envoy_gateway" {
  name             = "envoy-gateway"
  repository       = "oci://docker.io/envoyproxy"
  chart            = "gateway-helm"
  namespace        = "envoy-gateway-system"
  create_namespace = true
  version          = "v1.3.0"

  depends_on = [
    helm_release.aws_load_balancer_controller
  ]
}

# Metrics Server (HPA용)
resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.0"

}

# Karpenter (자동 스케일링)
resource "helm_release" "karpenter" {
  count            = var.enable_karpenter ? 1 : 0
  name             = "karpenter"
  repository       = "oci://public.ecr.aws/karpenter"
  chart            = "karpenter"
  namespace        = "karpenter"
  create_namespace = true
  version          = "1.9.0"

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
    value = "1"
  }

  set {
    name  = "controller.resources.requests.memory"
    value = "1Gi"
  }

  set {
    name  = "controller.resources.limits.cpu"
    value = "1"
  }

  set {
    name  = "controller.resources.limits.memory"
    value = "1Gi"
  }

  depends_on = [var.karpenter_controller_role_arn]
}

# Karpenter NodePool
resource "kubectl_manifest" "karpenter_nodepool" {
  count = var.enable_karpenter ? 1 : 0
  yaml_body = <<-YAML
    apiVersion: karpenter.sh/v1
    kind: NodePool
    metadata:
      name: default
    spec:
      template:
        spec:
          nodeClassRef:
            group: karpenter.k8s.aws
            kind: EC2NodeClass
            name: default
          requirements:
            - key: karpenter.sh/capacity-type
              operator: In
              values: ["spot"]
            - key: kubernetes.io/arch
              operator: In
              values: ["amd64"]
            - key: node.kubernetes.io/instance-type
              operator: In
              values: ["t3.medium"]
            - key: kubernetes.io/os
              operator: In
              values: ["linux"]
          expireAfter: 720h
      limits:
        cpu: "20"
        memory: "40Gi"
      disruption:
        consolidationPolicy: WhenEmptyOrUnderutilized
        consolidateAfter: 1m
  YAML

  depends_on = [helm_release.karpenter]
}

# Karpenter EC2NodeClass
resource "kubectl_manifest" "karpenter_ec2nodeclass" {
  count = var.enable_karpenter ? 1 : 0
  yaml_body = <<-YAML
    apiVersion: karpenter.k8s.aws/v1
    kind: EC2NodeClass
    metadata:
      name: default
    spec:
      amiSelectorTerms:
        - alias: al2@latest
      role: ${var.karpenter_node_role_name}
      subnetSelectorTerms:
        - tags:
            karpenter.sh/discovery: ${var.cluster_name}
      securityGroupSelectorTerms:
        - tags:
            karpenter.sh/discovery: ${var.cluster_name}
      tags:
        karpenter.sh/discovery: ${var.cluster_name}
        Name: karpenter-node
  YAML

  depends_on = [helm_release.karpenter]
}

