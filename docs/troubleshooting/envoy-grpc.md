# Envoy REST→gRPC 변환 문제 및 대안

## 현재 문제점

### Envoy grpc_json_transcoder 사용 시 문제
1. **proto.pb 파일 관리 복잡**
   - 매번 proto 파일 컴파일 필요
   - ConfigMap으로 proto.pb 관리 필요
   - 서비스 추가/변경 시 proto.pb 재생성 및 배포

2. **배포 복잡도**
   - Envoy ConfigMap 변경 시 Pod 재시작 필요
   - proto.pb 업데이트 시 동기화 문제
   - 설정 오류 시 디버깅 어려움

3. **Deprecated 경고**
   ```
   [warning] Using deprecated option 'envoy.config.route.v3.VirtualHost.cors'
   [warning] Using deprecated option 'envoy.extensions.filters.http.lua.v3.Lua.inline_code'
   ```

## 해결 방안 비교

### 방안 1: Gateway API (권장) ⭐

**장점:**
- Kubernetes 네이티브 (표준 API)
- Terraform으로 이미 설치됨 (Envoy Gateway, ALB Controller)
- proto.pb 불필요
- HTTPRoute로 간단한 라우팅

**단점:**
- REST→gRPC 변환 불가 (gRPC 서비스는 gRPC로 호출해야 함)

**구조:**
```
Client (REST) → Gateway API → gRPC-Web Proxy → gRPC Services
```

**적용 방법:**
```yaml
# HTTPRoute로 라우팅만 처리
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: backend-routes
spec:
  parentRefs:
  - name: pawfiler-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /quiz
    backendRefs:
    - name: quiz-service
      port: 50052
```

### 방안 2: Istio

**장점:**
- REST→gRPC 변환 가능 (EnvoyFilter 사용)
- 강력한 트래픽 관리, 보안, 관찰성
- Service Mesh 기능 (mTLS, Circuit Breaking 등)

**단점:**
- 추가 인프라 필요 (Control Plane)
- 리소스 오버헤드 (사이드카 프록시)
- 학습 곡선 높음
- 현재 프로젝트 규모에 과도할 수 있음

**설치:**
```bash
# Istio 설치
istioctl install --set profile=default

# EnvoyFilter로 gRPC-JSON 변환
kubectl apply -f istio-grpc-json-transcoder.yaml
```

### 방안 3: 별도 BFF (Backend for Frontend) 서비스

**장점:**
- REST→gRPC 변환을 애플리케이션 레벨에서 처리
- 비즈니스 로직 추가 가능 (인증, 데이터 변환 등)
- 프록시 설정 불필요
- 디버깅 쉬움

**단점:**
- 추가 서비스 개발 및 유지보수
- 레이턴시 증가 (홉 추가)

**구조:**
```
Client (REST) → BFF Service (Go/Node.js) → gRPC Services
```

**예시 (Go):**
```go
// BFF 서비스
http.HandleFunc("/quiz/list", func(w http.ResponseWriter, r *http.Request) {
    conn, _ := grpc.Dial("quiz-service:50052")
    client := pb.NewQuizServiceClient(conn)
    resp, _ := client.ListQuizzes(ctx, &pb.ListQuizzesRequest{})
    json.NewEncoder(w).Encode(resp)
})
```

### 방안 4: 현재 Envoy 유지 + 개선

**개선 사항:**
- proto.pb를 CI/CD에서 자동 생성
- ArgoCD로 ConfigMap 자동 배포
- Deprecated 설정 제거

**장점:**
- 현재 구조 유지
- 추가 인프라 불필요

**단점:**
- 여전히 proto.pb 관리 필요
- 복잡도 높음

## 권장 방안

### 단기: Gateway API + gRPC-Web

**이유:**
- 이미 Envoy Gateway 설치됨
- proto.pb 관리 불필요
- Kubernetes 표준

**변경 사항:**
1. Frontend를 gRPC-Web으로 변경
2. Gateway API HTTPRoute로 라우팅
3. Envoy 제거

```yaml
# gateway-api/httproute.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: backend-routes
  namespace: pawfiler
spec:
  parentRefs:
  - name: pawfiler-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /quiz
    backendRefs:
    - name: quiz-service
      port: 50052
  - matches:
    - path:
        type: PathPrefix
        value: /community
    backendRefs:
    - name: community-service
      port: 50053
```

### 장기: BFF 서비스 추가 (필요 시)

비즈니스 로직이 복잡해지면 BFF 서비스 도입 고려.

## 마이그레이션 단계

### 1단계: Gateway API로 전환
```bash
# 1. HTTPRoute 생성
kubectl apply -f gateway-api/httproute.yaml

# 2. Ingress를 Gateway로 변경
kubectl apply -f gateway-api/gateway.yaml

# 3. Envoy 제거
kubectl delete -f infrastructure/envoy/
```

### 2단계: Frontend gRPC-Web 적용
```typescript
// Frontend에서 gRPC-Web 사용
import { QuizServiceClient } from './generated/quiz_grpc_web_pb';

const client = new QuizServiceClient('https://api.pawfiler.com');
const request = new ListQuizzesRequest();
client.listQuizzes(request, {}, (err, response) => {
  console.log(response.toObject());
});
```

### 3단계: 모니터링 및 최적화

## 결론

### 근본적인 질문: 왜 프록시가 필요한가?

**프록시를 사용하는 이유:**
- REST API를 gRPC 백엔드로 변환
- CORS 처리
- 라우팅

**문제:**
- 프록시 = 추가 관리 포인트
- 설정 복잡도 증가
- 레이턴시 증가
- 장애 포인트 추가

### 최선의 해결책: 프록시 제거

**방안 1: Frontend에서 직접 gRPC 호출 (가장 단순)** ⭐

```typescript
// Frontend에서 gRPC-Web 직접 사용
import { QuizServiceClient } from './generated/quiz_grpc_web_pb';

const client = new QuizServiceClient('https://quiz-service.pawfiler.com');
```

**장점:**
- 프록시 불필요
- 설정 최소화
- 레이턴시 최소
- 관리 포인트 감소

**필요한 것:**
- gRPC 서비스에 gRPC-Web 지원 추가 (간단)
- Ingress로 각 서비스 직접 노출

```go
// 백엔드에 gRPC-Web 추가 (한 줄)
grpcServer := grpc.NewServer()
grpcWebServer := grpcweb.WrapServer(grpcServer)
```

**방안 2: REST API가 필요하면 각 서비스에서 제공**

```go
// 각 gRPC 서비스에 REST endpoint 추가
func main() {
    // gRPC 서버
    go grpc.Serve(lis)
    
    // REST 서버 (같은 서비스 내)
    http.HandleFunc("/api/quiz/list", restHandler)
    http.ListenAndServe(":8080", nil)
}
```

**장점:**
- 프록시 불필요
- 각 팀이 자기 서비스만 관리
- 변환 로직이 서비스 내부에 있어 디버깅 쉬움

### 권장 아키텍처

```
Before (복잡):
Client → ALB → Envoy (proto.pb 관리) → gRPC Services

After (단순):
Client → ALB → gRPC Services (gRPC-Web 지원)
```

**또는:**

```
Client (REST 필요 시) → ALB → Services (gRPC + REST 둘 다 제공)
```

### 결론

1. **프록시는 필요악이 아니라 불필요한 복잡도**
2. **Frontend gRPC-Web 직접 사용 권장**
3. **REST가 꼭 필요하면 각 서비스에서 제공**
4. **Gateway API, Istio, Envoy 모두 불필요**

**Envoy/Gateway API/Istio는 다음 경우에만 고려:**
- 레거시 REST 클라이언트 지원 필수
- 중앙화된 인증/인가 필요
- 트래픽 분할, 카나리 배포 등 고급 기능 필요
