# Troubleshooting: Envoy transcoder → grpc-gateway 마이그레이션

## 문제 상황

### 기존 구조
```
CloudFront → ALB → Envoy (grpc_json_transcoder) → gRPC Services
```

### 발생한 문제들

1. **proto.pb 동기화 에러**: proto 파일 변경 시 ConfigMap의 proto.pb도 수동으로 재생성/재배포 필요
2. **배포 순서 의존성**: 서비스 배포 전에 Envoy ConfigMap 먼저 업데이트 안 하면 500 에러
3. **grpc_json_transcoder deprecated 경고**: Envoy 최신 버전에서 deprecated 방향

```bash
# 배포마다 이걸 해야 했음
protoc --include_imports --include_source_info \
  --descriptor_set_out=proto.pb \
  quiz.proto community.proto video_analysis.proto

kubectl create configmap proto-descriptor \
  --from-file=proto.pb -n pawfiler --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/envoy -n pawfiler
```

---

## 왜 grpc-gateway로 바꾸는가

| | Envoy transcoder | grpc-gateway |
|---|---|---|
| proto.pb 관리 | ConfigMap에 별도 관리 필요 | 불필요 (코드 생성) |
| 배포 의존성 | Envoy → 서비스 순서 중요 | 서비스 자체에 포함, 독립적 |
| 언어 의존성 | 언어 무관 | **Go 전용** |
| 변환 위치 | Envoy Pod 내부 | 각 서비스 내부 |
| 디버깅 | Envoy 로그 별도 확인 | 서비스 로그로 통합 |

**우리 프로젝트 조건: 모든 백엔드가 Go → grpc-gateway가 최적**

---

## 해결 방법: grpc-gateway 적용

### 최종 구조
```
Before: CloudFront → ALB → Envoy (transcoder) → gRPC Services (:50052)

After:  CloudFront → ALB (Ingress path routing)
                       ├── /api/quiz/*       → quiz-service:8080
                       ├── /api/community/*  → community-service:8080
                       └── /api/video/*      → video-service:8080

        서비스간 통신은 여전히 gRPC (:50052)
```

Envoy Pod 자체를 제거하고 ALB Ingress가 라우팅을 담당.

---

### Step 1: proto 파일에 HTTP 옵션 추가

```protobuf
// quiz.proto
syntax = "proto3";
package quiz;

import "google/api/annotations.proto";  // 추가

service QuizService {
  rpc GetRandomQuestion(GetRandomQuestionRequest) returns (QuizQuestion) {
    option (google.api.http) = {
      get: "/api/quiz/question/random"
    };
  }

  rpc SubmitAnswer(SubmitAnswerRequest) returns (SubmitAnswerResponse) {
    option (google.api.http) = {
      post: "/api/quiz/answer"
      body: "*"
    };
  }

  rpc GetUserStats(GetUserStatsRequest) returns (QuizStats) {
    option (google.api.http) = {
      get: "/api/quiz/stats/{user_id}"
    };
  }

  rpc GetQuestionById(GetQuestionByIdRequest) returns (QuizQuestion) {
    option (google.api.http) = {
      get: "/api/quiz/question/{question_id}"
    };
  }
}
```

### Step 2: 코드 생성

```bash
# 필요한 도구 설치
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest

# 코드 생성 (서비스별)
cd backend/services/quiz
protoc -I../../proto -I$(go env GOPATH)/pkg/mod/github.com/grpc-ecosystem/grpc-gateway/v2@latest/third_party/googleapis \
  --go_out=./proto --go_opt=paths=source_relative \
  --go-grpc_out=./proto --go-grpc_opt=paths=source_relative \
  --grpc-gateway_out=./proto --grpc-gateway_opt=paths=source_relative \
  ../../proto/quiz.proto
```

### Step 3: main.go 수정 (quiz-service 예시)

```go
// backend/services/quiz/main.go
package main

import (
    "context"
    "database/sql"
    "log"
    "net"
    "net/http"
    "os"
    "time"

    "github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
    _ "github.com/lib/pq"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    pb "github.com/pawfiler/backend/services/quiz/proto"
    "github.com/pawfiler/backend/services/quiz/internal/handler"
    "github.com/pawfiler/backend/services/quiz/internal/repository"
    "github.com/pawfiler/backend/services/quiz/internal/service"
)

func main() {
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" {
        log.Fatal("DATABASE_URL not set")
    }

    db, err := sql.Open("postgres", dbURL)
    if err != nil {
        log.Fatalf("Failed to connect to database: %v", err)
    }
    defer db.Close()

    db.SetMaxOpenConns(50)
    db.SetMaxIdleConns(25)
    db.SetConnMaxLifetime(5 * time.Minute)

    if err := db.Ping(); err != nil {
        log.Fatalf("Failed to ping database: %v", err)
    }

    repo := repository.NewQuizRepository(db)
    statsTracker := service.NewStatsTracker(repo)
    validator := service.NewAnswerValidator()
    svc := service.NewQuizService(repo, statsTracker, validator)
    quizHandler := handler.NewQuizHandler(svc)

    // gRPC 서버 (기존 그대로)
    grpcPort := os.Getenv("GRPC_PORT")
    if grpcPort == "" {
        grpcPort = "50052"
    }

    lis, err := net.Listen("tcp", ":"+grpcPort)
    if err != nil {
        log.Fatalf("Failed to listen: %v", err)
    }

    grpcServer := grpc.NewServer()
    pb.RegisterQuizServiceServer(grpcServer, quizHandler)

    go func() {
        log.Printf("gRPC server started on :%s", grpcPort)
        if err := grpcServer.Serve(lis); err != nil {
            log.Fatalf("Failed to serve gRPC: %v", err)
        }
    }()

    // grpc-gateway (REST 서버 추가)
    ctx := context.Background()
    mux := runtime.NewServeMux()

    opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
    if err := pb.RegisterQuizServiceHandlerFromEndpoint(ctx, mux, ":"+grpcPort, opts); err != nil {
        log.Fatalf("Failed to register gateway: %v", err)
    }

    httpPort := os.Getenv("HTTP_PORT")
    if httpPort == "" {
        httpPort = "8080"
    }

    log.Printf("REST gateway started on :%s", httpPort)
    if err := http.ListenAndServe(":"+httpPort, mux); err != nil {
        log.Fatalf("Failed to serve HTTP: %v", err)
    }
}
```

### Step 4: go.mod 의존성 추가

```bash
cd backend/services/quiz
go get github.com/grpc-ecosystem/grpc-gateway/v2
go get google.golang.org/genproto/googleapis/api
```

### Step 5: Kubernetes 서비스 포트 추가

```yaml
# k8s/quiz-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: quiz-service
  namespace: pawfiler
spec:
  selector:
    app: quiz-service
  ports:
    - name: grpc
      port: 50052
      targetPort: 50052
    - name: http    # 추가
      port: 8080
      targetPort: 8080
```

### Step 6: Ingress로 ALB path routing

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pawfiler-ingress
  namespace: pawfiler
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
    - http:
        paths:
          - path: /api/quiz
            pathType: Prefix
            backend:
              service:
                name: quiz-service
                port:
                  number: 8080
          - path: /api/community
            pathType: Prefix
            backend:
              service:
                name: community-service
                port:
                  number: 8080
          - path: /api/video
            pathType: Prefix
            backend:
              service:
                name: video-analysis
                port:
                  number: 8080
```

---

## Envoy 제거

grpc-gateway 적용 완료 후:

```bash
# Envoy 관련 리소스 제거
kubectl delete deployment envoy -n pawfiler
kubectl delete service envoy -n pawfiler
kubectl delete hpa envoy-hpa -n pawfiler
kubectl delete configmap proto-descriptor -n pawfiler

# ArgoCD에서도 제거
# helm/templates/envoy-deployment.yaml 삭제
```

---

## 마이그레이션 순서

1. quiz-service에 grpc-gateway 적용 + 테스트
2. community-service 적용
3. video-service 적용
4. Ingress 배포 (ALB path routing 확인)
5. CloudFront origin을 Envoy → ALB로 전환
6. Envoy 제거

---

## 교훈

- **Envoy transcoder는 언어 무관 범용 솔루션**: 다양한 언어 혼용 시 유리
- **grpc-gateway는 Go 네이티브**: 백엔드가 전부 Go라면 더 단순하고 안정적
- **proto.pb 동기화 문제의 근본 원인**: 변환 로직이 서비스 밖(Envoy)에 있었기 때문
- **grpc-gateway로 변환 로직이 서비스 내부로**: 배포 의존성 제거

## 참고

- [grpc-gateway 공식 문서](https://grpc-ecosystem.github.io/grpc-gateway/)
- 기존 Envoy 설정: `backend/envoy/envoy.yaml`
- Proto 파일: `backend/proto/`
