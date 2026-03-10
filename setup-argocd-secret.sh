#!/bin/bash
ARGOCD_REPO_TOKEN="${ARGOCD_REPO_TOKEN}"
ECR_REGISTRY=$(terraform output -raw ecr_repository_urls | jq -r '.quiz_service' | cut -d'/' -f1)

kubectl create secret generic github-creds \
  -n argocd \
  --from-literal=type=git \
  --from-literal=url=https://github.com/vanillaturtlechips/pawfiler4-argocd \
  --from-literal=username=vanillaturtlechips \
  --from-literal=password=$ARGOCD_REPO_TOKEN \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl label secret github-creds -n argocd argocd.argoproj.io/secret-type=repository --overwrite

echo "ECR_REGISTRY=$ECR_REGISTRY"
