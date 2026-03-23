# ============================================================================
# ISTIO - Service Mesh (Pattern 1: ALB 유지, 사이드카만 pawfiler 네임스페이스 적용)
# 설치 순서: istio-base → istiod → namespace 라벨
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
      # mTLS PERMISSIVE: 기존 서비스 영향 없이 사이드카 없는 서비스와도 통신 가능
      defaultConfig = {
        holdApplicationUntilProxyStarts = true
      }
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

# 3. pawfiler 네임스페이스 사이드카 주입 활성화
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

# 4. admin 네임스페이스 사이드카 주입 활성화
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

# 5. ai-orchestration 네임스페이스 사이드카 명시적 차단 (Ray 포트 충돌 방지)
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
