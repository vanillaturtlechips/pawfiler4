# ============================================================================
# Helm Releases - AWS Load Balancer Controller, ArgoCD, Kubecost
# ============================================================================

# AWS Load Balancer Controller (Gateway API 지원)
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.8.0"

  set {
    name  = "clusterName"
    value = aws_eks_cluster.main.name
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
    value = aws_vpc.main.id
  }

  depends_on = [
    aws_eks_cluster.main,
    aws_eks_node_group.main
  ]
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

  depends_on = [aws_eks_node_group.main]
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
    value = aws_eks_cluster.main.name
  }

  # AWS Cloud Integration
  set {
    name  = "kubecostProductConfigs.clusterName"
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "kubecostProductConfigs.awsSpotDataRegion"
    value = var.aws_region
  }

  set {
    name  = "kubecostProductConfigs.awsSpotDataBucket"
    value = "s3://spot-data-feed-${data.aws_caller_identity.current.account_id}"
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

  depends_on = [
    aws_eks_node_group.main,
    aws_eks_addon.ebs_csi_driver
  ]
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
              url       = "http://kubecost-prometheus-server.monitoring.svc.cluster.local"
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
    helm_release.kubecost
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
    aws_eks_node_group.main,
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

  depends_on = [aws_eks_node_group.main]
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
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "settings.clusterEndpoint"
    value = aws_eks_cluster.main.endpoint
  }

  set {
    name  = "settings.interruptionQueue"
    value = aws_sqs_queue.karpenter[0].name
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.karpenter_controller[0].arn
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

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role.karpenter_controller,
    aws_sqs_queue.karpenter
  ]
}
