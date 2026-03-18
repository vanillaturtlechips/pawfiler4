# Envoy Gateway Setup Guide

## Overview

BFF를 제거하고 Envoy를 통해 gRPC 서비스에 직접 연결합니다.

## Architecture

```
Frontend (S3) → Envoy Gateway → gRPC Services
                    ↓
            - Quiz Service (50052)
            - Community Service (50053)
            - Admin Service (8082)
```

## Local Development

### Envoy 컨테이너 사용

로컬에서 Envoy 컨테이너를 띄워서 개발합니다.

**1. Docker Compose로 전체 실행**
```bash
cd backend
docker-compose up
```

이렇게 하면 다음 서비스들이 모두 실행됩니다:
- PostgreSQL (5432)
- Quiz Service (50052)
- Community Service (50053)
- Admin Service (8082)
- Envoy Gateway (8080)

**2. 프론트엔드 환경 변수 설정**

**frontend/.env**
```env
VITE_QUIZ_API_URL=http://localhost:8080/quiz
VITE_COMMUNITY_API_URL=http://localhost:8080/community
```

**admin-frontend/.env**
```env
VITE_ADMIN_API_URL=http://localhost:8082
```

**3. 프론트엔드 실행**
```bash
# 사용자 프론트엔드
cd frontend
npm install
npm run dev

# 관리자 프론트엔드
cd admin-frontend
npm install
npm run dev
```

## Kubernetes Deployment

### 1. Envoy Gateway 설치

```bash
kubectl apply -f https://github.com/envoyproxy/gateway/releases/download/latest/install.yaml
```

### 2. Gateway API 리소스 생성

**gateway.yaml**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: pawfiler-gateway
  namespace: default
spec:
  gatewayClassName: envoy
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
```

### 3. HTTPRoute 생성

**httproute-quiz.yaml**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: quiz-route
  namespace: default
spec:
  parentRefs:
  - name: pawfiler-gateway
  hostnames:
  - "api.pawfiler.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /quiz.QuizService/
    backendRefs:
    - name: quiz-service
      port: 50052
```

**httproute-community.yaml**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: community-route
  namespace: default
spec:
  parentRefs:
  - name: pawfiler-gateway
  hostnames:
  - "api.pawfiler.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /community.CommunityService/
    backendRefs:
    - name: community-service
      port: 50053
```

### 4. Service 생성

```yaml
apiVersion: v1
kind: Service
metadata:
  name: quiz-service
spec:
  selector:
    app: quiz-service
  ports:
  - port: 50052
    targetPort: 50052
    protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: community-service
spec:
  selector:
    app: community-service
  ports:
  - port: 50053
    targetPort: 50053
    protocol: TCP
```

## gRPC-Web Support

Envoy Gateway는 자동으로 gRPC-Web transcoding을 지원합니다:
- HTTP/1.1 → gRPC 변환
- CORS 헤더 자동 추가
- JSON ↔ Protobuf 변환

## CORS Configuration

Envoy Gateway에서 CORS를 설정하려면 `BackendTrafficPolicy`를 사용합니다:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: cors-policy
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: pawfiler-gateway
  cors:
    allowOrigins:
    - "https://pawfiler.com"
    - "https://admin.pawfiler.com"
    allowMethods:
    - GET
    - POST
    - PUT
    - DELETE
    - OPTIONS
    allowHeaders:
    - "*"
    exposeHeaders:
    - "*"
    maxAge: 3600
```

## Production URLs

- Frontend: `https://pawfiler.com` → Envoy Gateway → gRPC Services
- Admin Frontend: `https://admin.pawfiler.com` (S3 only, Bastion access)
- API Gateway: `https://api.pawfiler.com` (Envoy Gateway)

## Migration Checklist

- [x] Terraform: BFF ECR 제거
- [x] 배포 스크립트: BFF 빌드/푸시 제거
- [x] 프론트엔드: API 엔드포인트 변경 (BFF → 직접 gRPC)
- [ ] K8s 매니페스트: Gateway API 리소스 생성 (ArgoCD 레포)
- [ ] 백엔드 서비스: gRPC-Web CORS 지원 확인
- [ ] 프론트엔드: gRPC-Web 클라이언트 구현 (필요시)
- [ ] 테스트: 로컬 환경에서 Envoy Gateway 없이 직접 gRPC 연결 테스트
- [ ] 배포: EKS에 Envoy Gateway 설치 및 설정

## Notes

- BFF는 완전히 제거되었습니다
- 프론트엔드는 Envoy Gateway를 통해 gRPC 서비스에 직접 연결합니다
- 로컬 개발 시에는 gRPC 서비스에 직접 연결 (Envoy Gateway 불필요)
- 프로덕션에서는 Envoy Gateway가 gRPC-Web transcoding 처리
