# Gateway API vs Ingress API

## 현재 설정

프로젝트에 **두 가지 방식 모두** 제공됩니다:

### 1. Ingress API (기존 방식)
- 파일: `k8s/ingress.yaml`, `k8s/frontend.yaml`
- API: `networking.k8s.io/v1`
- 안정적이고 널리 사용됨

### 2. Gateway API (최신 방식) ⭐ 권장
- 파일: `k8s/gateway-api.yaml`
- API: `gateway.networking.k8s.io/v1`
- 더 유연하고 확장 가능

## 사용 방법

### Ingress API 사용 (기본)
```bash
./scripts/deploy.sh
# ingress.yaml과 frontend.yaml이 자동 배포됨
```

### Gateway API 사용 (권장)
```bash
# 1. Gateway API CRD 설치 (deploy.sh에 포함됨)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml

# 2. 기존 Ingress 제거
kubectl delete -f k8s/ingress.yaml
kubectl delete ingress frontend-ingress -n pawfiler

# 3. Gateway API 배포
kubectl apply -f k8s/gateway-api.yaml
```

## 차이점

| 항목 | Ingress API | Gateway API |
|------|-------------|-------------|
| 성숙도 | 안정 (GA) | 안정 (v1.0+) |
| 유연성 | 제한적 | 높음 |
| 라우팅 | 기본 | 고급 (헤더, 쿼리 등) |
| TLS | 기본 | 세밀한 제어 |
| 멀티 프로토콜 | HTTP/HTTPS | HTTP/HTTPS/TCP/UDP |
| 역할 분리 | 없음 | Gateway/Route 분리 |

## 권장 사항

**Gateway API 사용을 권장합니다:**
- AWS Load Balancer Controller가 Gateway API 지원
- 더 나은 트래픽 관리
- 향후 확장성

**Ingress API는 다음 경우 사용:**
- 빠른 배포가 필요한 경우
- 단순한 라우팅만 필요한 경우
- 기존 설정 유지

## 전환 방법

기존 Ingress → Gateway API로 전환:
```bash
# 기존 삭제
kubectl delete -f k8s/ingress.yaml
kubectl delete -f k8s/frontend.yaml --selector=kind=Ingress

# Gateway API 배포
kubectl apply -f k8s/gateway-api.yaml
```
