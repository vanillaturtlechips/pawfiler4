# k8s 매니페스트 (배포 테스트용 예시)

> **이 파일들은 CD 레포로 이전하기 전 로컬 테스트용 예시입니다.**
> 실제 운영 배포는 별도 ArgoCD CD 레포에서 관리합니다.

## 구조

```
k8s/
├── namespace.yaml          # pawfiler 네임스페이스
├── db-secret.yaml          # DB 접속 정보 (git 제외 - .gitignore)
├── quiz-service.yaml       # Quiz Service Deployment + ClusterIP
├── community-service.yaml  # Community Service Deployment + ClusterIP
├── envoy-gateway.yaml      # GatewayClass + Gateway + HTTPRoute
├── kustomization.yaml
└── admin/                  # 어드민 전용 네임스페이스 (바스쳔 port-forward)
    ├── namespace.yaml
    ├── db-secret.yaml      # git 제외
    ├── admin-service.yaml
    ├── admin-frontend.yaml
    └── kustomization.yaml
```

## 테스트 배포

```bash
# db-secret.yaml 실제 값 채운 후
kubectl apply -k k8s/
kubectl apply -k k8s/admin/
```

## 어드민 접속 (로컬 or 바스쳔)

```bash
./scripts/bastion-admin.sh
# 브라우저: http://localhost:3000
```
