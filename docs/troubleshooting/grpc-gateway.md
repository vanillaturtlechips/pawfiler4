# Envoy transcoder 제거 → 서비스 내장 REST 핸들러 마이그레이션

## 배경

### 기존 구조 (Envoy transcoder)
```
Client (REST JSON) → ALB → Envoy (grpc_json_transcoder) → gRPC Services (:50052/53/54)
```

Envoy가 REST ↔ gRPC 변환을 담당. 문제점:
- proto.pb 파일을 별도 ConfigMap으로 관리 → proto 변경 시 proto.pb 재생성 + Envoy 재시작 필요
- 배포 순서 의존성 (Envoy ConfigMap → Envoy 재시작 → 서비스 배포)
- Envoy 설정 deprecated 경고 누적
- 단일 장애 포인트

### 새 구조 (서비스 내장 REST)
```
Client (REST JSON) → ALB (path routing)
                      ├── /api/quiz.QuizService/*       → quiz-service:8080
                      ├── /api/community.CommunityService/* → community-service:8080
                      └── /api/video_analysis.VideoAnalysisService/* → video-analysis:8080

서비스 내부:
  gRPC (:50052/53/54) ← 서비스 간 내부 통신
  HTTP (:8080)        ← 외부 REST 요청 처리
```

각 서비스가 gRPC + HTTP 서버를 동시에 실행. Envoy Pod 자체가 불필요.

---

## 구현 방식 비교

### grpc-gateway 라이브러리 vs 직접 HTTP 핸들러

| | grpc-gateway 라이브러리 | 직접 HTTP 핸들러 (채택) |
|---|---|---|
| proto 파일 수정 | HTTP 옵션 어노테이션 추가 필요 | 불필요 |
| 코드 생성 | protoc-gen-grpc-gateway 필요 | 불필요 |
| URL 형식 | `/api/quiz/question/random` (REST-style) | `/api/quiz.QuizService/GetRandomQuestion` (RPC-style, 프론트엔드 변경 없음) |
| 구현 복잡도 | 중간 (코드 생성 파이프라인) | 낮음 (직접 작성) |

**채택 이유**: 프론트엔드가 이미 `/api/quiz.QuizService/MethodName` URL을 사용 중이어서 변경 없이 그대로 연결 가능.

---

## 실제 구현

### Go 서비스 (quiz-service, community-service)

**`internal/rest/handler.go`** 추가:
```go
package rest

import (
    "context"
    "net/http"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
    "google.golang.org/protobuf/encoding/protojson"
    "google.golang.org/protobuf/proto"
)

func NewMux(svc QuizService) http.Handler {
    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })
    // 프론트엔드가 /api/ prefix 사용 → 둘 다 등록
    for _, prefix := range []string{"", "/api"} {
        mux.HandleFunc(prefix+"/quiz.QuizService/GetRandomQuestion", withCORS(handleGetRandomQuestion(svc)))
        mux.HandleFunc(prefix+"/quiz.QuizService/SubmitAnswer", withCORS(handleSubmitAnswer(svc)))
        mux.HandleFunc(prefix+"/quiz.QuizService/GetUserStats", withCORS(handleGetUserStats(svc)))
        mux.HandleFunc(prefix+"/quiz.QuizService/GetQuestionById", withCORS(handleGetQuestionById(svc)))
    }
    return mux
}

// gRPC 에러 코드 → HTTP 상태코드 변환
func grpcToHTTPStatus(err error) int {
    if err == nil { return http.StatusOK }
    switch status.Code(err) {
    case codes.NotFound:      return http.StatusNotFound
    case codes.InvalidArgument: return http.StatusBadRequest
    case codes.Unauthenticated: return http.StatusUnauthorized
    case codes.PermissionDenied: return http.StatusForbidden
    case codes.AlreadyExists:  return http.StatusConflict
    default:                  return http.StatusInternalServerError
    }
}
```

**`cmd/server/main.go`** 수정 (gRPC goroutine + HTTP main):
```go
// gRPC 서버는 goroutine으로
go func() {
    log.Printf("Quiz gRPC server started on :%s", port)
    if err := grpcServer.Serve(lis); err != nil {
        log.Fatalf("Failed to serve gRPC: %v", err)
    }
}()

// HTTP REST 서버는 main thread
httpPort := os.Getenv("HTTP_PORT")
if httpPort == "" { httpPort = "8080" }
log.Printf("Quiz REST server started on :%s", httpPort)
if err := http.ListenAndServe(":"+httpPort, rest.NewMux(quizHandler)); err != nil {
    log.Fatalf("Failed to serve HTTP: %v", err)
}
```

### Python 서비스 (video-analysis)

**`rest_server.py`** 추가 (Flask):
```python
from flask import Flask, request, jsonify
from flask_cors import CORS

def create_app(service):
    app = Flask(__name__)
    CORS(app)

    @app.get("/health")
    def health():
        return "", 200

    def _analyze(data):
        import video_analysis_pb2
        class FakeContext:
            def set_code(self, c): pass
            def set_details(self, d): pass
        req = video_analysis_pb2.AnalyzeVideoRequest(
            video_url=data.get("video_url", ""),
            user_id=data.get("user_id", "")
        )
        resp = service.AnalyzeVideo(req, FakeContext())
        return jsonify({"task_id": resp.task_id, ...})

    for prefix in ["", "/api"]:
        app.add_url_rule(
            f"{prefix}/video_analysis.VideoAnalysisService/AnalyzeVideo",
            view_func=lambda: _analyze(request.get_json() or {}),
            methods=["POST", "OPTIONS"]
        )
    return app

def run_rest_server(service):
    http_port = int(os.getenv("HTTP_PORT", "8080"))
    app = create_app(service)
    app.run(host="0.0.0.0", port=http_port, threaded=True)
```

**`server.py`** 수정:
```python
def serve():
    svc = VideoAnalysisService()  # 공유 인스턴스

    # REST 서버 daemon thread
    threading.Thread(target=run_rest_server, args=(svc,), daemon=True).start()

    # gRPC 서버
    grpc_server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    video_analysis_pb2_grpc.add_VideoAnalysisServiceServicer_to_server(svc, grpc_server)
    grpc_server.add_insecure_port("[::]:50054")
    grpc_server.start()
    grpc_server.wait_for_termination()
```

---

## Kubernetes 변경사항

### 서비스별 deployment.yaml 변경

```yaml
# 8080 포트 추가
ports:
- containerPort: 50052
  name: grpc
- containerPort: 8080   # 추가
  name: http

# HTTP_PORT 환경변수
env:
- name: HTTP_PORT
  value: "8080"

# Health probe (grpc_health_probe → HTTP)
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 15

# Service에 8080 포트 추가
ports:
- name: grpc
  port: 50052
  targetPort: 50052
- name: http
  port: 8080
  targetPort: 8080
```

### ALB Ingress (`k8s/ingress-alb.yaml`)

```yaml
# 기존 (Envoy 단일 백엔드)
# backend:
#   service:
#     name: envoy
#     port: 8080

# 변경 후 (서비스별 직접 라우팅)
rules:
- http:
    paths:
    - path: /api/quiz.QuizService
      pathType: Prefix
      backend:
        service:
          name: quiz-service
          port:
            number: 8080
    - path: /api/community.CommunityService
      pathType: Prefix
      backend:
        service:
          name: community-service
          port:
            number: 8080
    - path: /api/video_analysis.VideoAnalysisService
      pathType: Prefix
      backend:
        service:
          name: video-analysis
          port:
            number: 8080
```

### ArgoCD (apps/base/kustomization.yaml)

```yaml
# envoy 제거
resources:
- namespace.yaml
- redis.yaml
- db-credentials.yaml
# - envoy.yaml  ← 삭제
```

---

## Envoy 클러스터에서 제거

```bash
kubectl delete deployment envoy -n pawfiler
kubectl delete service envoy -n pawfiler
kubectl delete hpa envoy-hpa -n pawfiler
kubectl delete configmap proto-descriptor envoy-config -n pawfiler
```

---

## 발생했던 문제들

### 1. Gateway API GatewayClass Unknown
**증상**: `kubectl get gateway` → Status: Unknown
**원인**: AWS LBC v2.8에 `--enable-gateway-api=true` 플래그 미설정
**해결**: Gateway API 대신 표준 ALB Ingress로 전환

### 2. video-analysis ServiceAccount/ConfigMap ArgoCD prune
**증상**: ArgoCD sync 후 `video-analysis-sa`, `video-analysis-config` 삭제됨
**원인**: ArgoCD가 관리하는 `apps/services/video-analysis/deployment.yaml`에 해당 리소스 없었음
**해결**: deployment.yaml에 ServiceAccount + ConfigMap 포함

### 3. video-analysis DB secret key 없음
**증상**: Pod CrashLoopBackOff - `db-credentials` secret에 `host`, `port`, `username`, `password`, `database` 키 없음
**원인**: 다른 서비스들과 다른 key 구조
**해결**: video-analysis deployment에서 DB 관련 env var 제거 (현재 S3만 사용)
> DB 연결 시 `db-credentials` secret에 `video-analysis-db-url` 키 추가 후 아래 주석 해제:
> ```yaml
> # - name: DATABASE_URL
> #   valueFrom:
> #     secretKeyRef:
> #       name: db-credentials
> #       key: video-analysis-db-url
> ```

### 4. liveness probe grpc_health_probe 실패
**증상**: video-analysis pod 반복 restart
**원인**: probe가 `grpc_health_probe` 사용 → 바이너리 없거나 gRPC 서버 초기화 전에 실행
**해결**: HTTP `/health:8080` probe로 교체 (Flask REST 서버가 즉시 응답)

### 5. ECR repo 이름 오류
**증상**: `docker push` 실패 - repository does not exist
**원인**: `pawfiler/video-analysis` 가 아닌 `pawfiler/video-analysis-service` 가 실제 ECR repo 이름
**해결**: 올바른 이름으로 re-tag 후 push

---

## 로컬 테스트

```bash
# quiz-service 포트포워드
kubectl port-forward svc/quiz-service -n pawfiler 18080:8080

# frontend .env.local
VITE_API_BASE_URL=http://localhost:18080

# curl 테스트
curl -s -X POST http://localhost:18080/api/quiz.QuizService/GetRandomQuestion \
  -H 'Content-Type: application/json' -d '{}'
```

---

## 교훈

- **Envoy transcoder는 proto.pb 동기화 문제가 근본 원인**: 변환 로직이 서비스 밖에 있어서
- **모든 백엔드가 Go/Python이면 프록시 없이 직접 HTTP 핸들러가 더 단순**
- **Gateway API는 GatewayClass 지원 여부 확인 필수** (LBC 플래그 `--enable-gateway-api=true`)
- **ArgoCD prune**: 클러스터에 있는 리소스는 ArgoCD 관리 YAML에도 반드시 포함되어야 함
