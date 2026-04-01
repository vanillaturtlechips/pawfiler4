# ============================================================================
# ISTIO - Service Mesh (Pattern 2: Istio Gateway + NLB, ALB 제거)
# 설치 순서: istio-base → istiod → istio-ingress(NLB) → namespace 라벨
# NLB(L4)에서 ACM TLS 종료 → IngressGateway로 plain HTTP 전달
# ============================================================================

# 1. istio-base: CRD + ClusterRole (istiod보다 먼저 설치 필수)
resource "helm_release" "istio_base" {
  count            = var.enable_istio ? 1 : 0
  name             = "istio-base"
  repository       = "https://istio-release.storage.googleapis.com/charts"
  chart            = "base"
  namespace        = "istio-system"
  create_namespace = true
  version          = "1.24.2"
}

# 2. istiod: 컨트롤 플레인 (Pilot + Citadel 통합)
resource "helm_release" "istiod" {
  count      = var.enable_istio ? 1 : 0
  name       = "istiod"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "istiod"
  namespace  = "istio-system"
  version    = "1.24.2"

  values = [yamlencode({
    meshConfig = {
      # Envoy access log → stdout → otel-collector filelog → Loki
      accessLogFile   = "/dev/stdout"
      accessLogEncoding = "JSON"
      defaultConfig = {
        holdApplicationUntilProxyStarts = true
      }
      # telemetry.yaml의 otel-tracing 프로바이더 정의
      # Envoy 사이드카 → OTel Collector → Tempo 트레이싱 파이프라인
      extensionProviders = [{
        name = "otel-tracing"
        opentelemetry = {
          service = "otel-collector.monitoring.svc.cluster.local"
          port    = 4317
        }
      }]
    }
    pilot = {
      resources = {
        requests = {
          cpu    = "100m"
          memory = "256Mi"
        }
        limits = {
          cpu    = "500m"
          memory = "512Mi"
        }
      }
    }
  })]

  depends_on = [helm_release.istio_base]
}

# 3. istio-ingress: IngressGateway (NLB + ACM TLS 종료)
#    NLB → port 443(TLS) → IngressGateway port 80(plain HTTP)
#    istio-ingress 네임스페이스는 IngressGateway 전용 (istio-system과 분리)
resource "helm_release" "istio_ingress" {
  count            = var.enable_istio ? 1 : 0
  name             = "istio-ingress"
  repository       = "https://istio-release.storage.googleapis.com/charts"
  chart            = "gateway"
  namespace        = "istio-ingress"
  create_namespace = true
  version          = "1.24.2"

  values = [yamlencode({
    service = {
      type = "LoadBalancer"
      annotations = {
        "service.beta.kubernetes.io/aws-load-balancer-type"             = "external"
        "service.beta.kubernetes.io/aws-load-balancer-nlb-target-type"  = "ip"
        "service.beta.kubernetes.io/aws-load-balancer-scheme"           = "internet-facing"
        "service.beta.kubernetes.io/aws-load-balancer-ssl-cert"         = "arn:aws:acm:ap-northeast-2:009946608368:certificate/239c3c8f-351c-424c-b507-8da0ee911a7e"
        "service.beta.kubernetes.io/aws-load-balancer-ssl-ports"        = "443"
        "service.beta.kubernetes.io/aws-load-balancer-backend-protocol" = "tcp"
      }
      ports = [
        { name = "http2", port = 80, targetPort = 80 },
        { name = "https", port = 443, targetPort = 80 }  # NLB TLS → GW plain HTTP
      ]
    }
    labels = {
      istio = "ingressgateway"
    }
  })]

  depends_on = [helm_release.istiod]
}

# 5. pawfiler 네임스페이스 사이드카 주입 활성화
#    server_side_apply = true: 네임스페이스가 이미 존재해도 라벨만 패치
resource "kubectl_manifest" "pawfiler_istio_injection" {
  count             = var.enable_istio ? 1 : 0
  server_side_apply = true
  force_conflicts   = true

  yaml_body = <<-YAML
    apiVersion: v1
    kind: Namespace
    metadata:
      name: pawfiler
      labels:
        istio-injection: "enabled"
  YAML

  depends_on = [helm_release.istiod]
}

# 6. admin 네임스페이스 사이드카 주입 활성화
resource "kubectl_manifest" "admin_istio_injection" {
  count             = var.enable_istio ? 1 : 0
  server_side_apply = true
  force_conflicts   = true

  yaml_body = <<-YAML
    apiVersion: v1
    kind: Namespace
    metadata:
      name: admin
      labels:
        istio-injection: "enabled"
  YAML

  depends_on = [helm_release.istiod]
}

# 7. ai-orchestration 네임스페이스 사이드카 명시적 차단 (Ray 포트 충돌 방지)
resource "kubectl_manifest" "ai_orchestration_istio_disabled" {
  count             = var.enable_istio ? 1 : 0
  server_side_apply = true
  force_conflicts   = true

  yaml_body = <<-YAML
    apiVersion: v1
    kind: Namespace
    metadata:
      name: ai-orchestration
      labels:
        istio-injection: "disabled"
  YAML

  depends_on = [helm_release.istiod]
}
