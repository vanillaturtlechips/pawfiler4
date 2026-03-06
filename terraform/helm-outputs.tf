# ============================================================================
# Helm Outputs - Commented out until Helm releases are enabled
# ============================================================================

# output "argocd_server_url" {
#   description = "ArgoCD server URL"
#   value       = "kubectl get svc argocd-server -n argocd"
# }

# output "argocd_initial_password" {
#   description = "ArgoCD initial admin password command"
#   value       = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
#   sensitive   = true
# }

# output "kubecost_url" {
#   description = "Kubecost dashboard access command"
#   value       = "kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090"
# }
