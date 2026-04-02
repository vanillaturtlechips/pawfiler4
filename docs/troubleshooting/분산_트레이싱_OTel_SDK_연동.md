# 분산 트레이싱 연결 안 됨 — Istio만으로는 부족하다

> **문서 작성 원칙**: 이 문서는 반드시 **성과 중심**으로 작성한다.
> 트러블슈팅 내용을 추가할 때는 항상 상단 "성과 요약" 테이블을 먼저 업데이트할 것.
> Before / After / 효과(수치) 세 컬럼을 모두 채워야 한다.
> 각 트러블슈팅 항목에는 반드시 **재현 방법**을 포함할 것.

## 성과 요약

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| 트레이스 연결 | Istio만: ingress → 서비스 각각 별개 트레이스 | OTel SDK: ingress → quiz → user 단일 트레이스 | **서비스 간 인과관계 추적 가능** |
| 트레이스 수집 방식 | Envoy sidecar 자동 생성 (앱 무관) | 앱 계층 OTel SDK + otelgrpc 인터셉터 | B3/W3C 헤더 자동 전파 |
| Tempo 트레이스 | 서비스별 독립 스팬, 연결 불가 | quiz-service 291개+ 수집, 서비스 간 연결 | Tempo TraceQL 검색 가능 |
| ArgoCD OutOfSync | kube-prometheus-stack caBundle diff 무한 반복 | ignoreDifferences 추가 | Synced/Healthy 유지 |
| Grafana 트레이스 패널 | No data (AMP datasource 오류) | 로컬 Prometheus + table 패널 타입 | Istio 메트릭 + Tempo 트레이스 정상 표시 |

---

## 핵심 원인: Istio Envoy는 헤더를 "생성"만 하고 "전파"는 앱이 해야 한다

```
[요청 흐름]
사용자 → istio-ingress → quiz-service → user-service

[Istio만 있을 때]
istio-ingress: trace-id=AAA 생성, 스팬 전송 ✓
quiz-service:  trace-id=BBB 새로 생성 ← 문제
user-service:  trace-id=CCC 새로 생성 ← 문제
→ Tempo에서 3개의 별개 트레이스로 저장됨

[OTel SDK 추가 후]
istio-ingress: trace-id=AAA 생성, B3 헤더 주입
quiz-service:  trace-id=AAA 상속 (otelgrpc.NewServerHandler가 헤더 파싱)
              → user-service 호출 시 trace-id=AAA 전파 (otelgrpc.NewClientHandler)
user-service:  trace-id=AAA 상속 (otelgrpc.NewServerHandler가 헤더 파싱)
→ Tempo에서 1개 트레이스로 연결됨 ✓
```

**왜 Istio로 충분하지 않은가?**

Envoy sidecar는 네트워크 레이어(L4/L7)에서 동작한다. Envoy가 incoming 요청의 B3 헤더를 읽어서 스팬을 생성하고 Tempo에 전송하지만, 앱이 outgoing 요청에 같은 헤더를 붙여주지 않으면 Envoy는 헤더 없이 나가는 요청을 새 루트 스팬으로 처리한다. 앱이 `context`를 통해 trace 헤더를 downstream 호출에 넘겨줘야 연결된다.

---

## 해결 방법: OTel SDK + otelgrpc 인터셉터

### 1. TracerProvider 초기화 (`tracing/tracing.go`)

각 서비스에 동일한 패턴으로 추가:

```go
package tracing

import (
    "context"
    "os"

    "go.opentelemetry.io/contrib/propagators/b3"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

func Init(ctx context.Context, serviceName string) (func(), error) {
    endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint == "" {
        endpoint = "otel-collector.monitoring.svc.cluster.local:4318"
    }
    exporter, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint(endpoint),
        otlptracehttp.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }
    res, _ := resource.New(ctx,
        resource.WithAttributes(semconv.ServiceName(serviceName)),
    )
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
    )
    otel.SetTracerProvider(tp)
    // B3 (Istio 기본) + W3C TraceContext 동시 지원
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        b3.New(),
        propagation.Baggage{},
    ))
    return func() { tp.Shutdown(context.Background()) }, nil
}
```

**왜 B3와 W3C 둘 다?**
Istio 기본값은 B3 헤더(`x-b3-traceid`, `x-b3-spanid`)이고 OTel 기본값은 W3C `traceparent`이다. 둘 다 등록하면 어느 형식으로 들어와도 파싱하고, 나갈 때는 둘 다 주입한다.

### 2. gRPC 서버 인터셉터 (`main.go`)

```go
// tracing 초기화
shutdown, err := tracing.Init(ctx, "quiz-service")
if err != nil {
    log.Printf("[WARN] tracing init failed: %v", err)
} else {
    defer shutdown()
}

// gRPC 서버에 OTel 핸들러 등록
s := grpc.NewServer(
    grpc.StatsHandler(otelgrpc.NewServerHandler()),
)
```

### 3. gRPC 클라이언트 인터셉터 (`userclient/client.go`)

```go
conn, err := grpc.NewClient(addr,
    grpc.WithTransportCredentials(insecure.NewCredentials()),
    grpc.WithStatsHandler(otelgrpc.NewClientHandler()),  // ← 이게 핵심
)
```

`NewClientHandler()`가 outgoing gRPC 요청에 현재 컨텍스트의 trace 헤더를 자동으로 주입한다.

### 4. go.mod 의존성 추가

```
go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc v0.54.0
go.opentelemetry.io/contrib/propagators/b3 v1.29.0
go.opentelemetry.io/otel v1.29.0
go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.29.0
go.opentelemetry.io/otel/sdk v1.29.0
```

---

## 트러블슈팅

### 1. ArgoCD kube-prometheus-stack OutOfSync — caBundle 자동 주입

**증상**: kube-prometheus-stack이 Synced 직후 OutOfSync로 돌아옴. diff를 보면 `caBundle` 필드만 다름.

**원인**: cert-manager 또는 kube-apiserver가 `MutatingWebhookConfiguration` / `ValidatingWebhookConfiguration`에 caBundle을 자동으로 주입. ArgoCD가 이를 drift로 감지.

**재현 방법**:
```bash
kubectl get mutatingwebhookconfiguration kube-prometheus-stack-admission -o yaml | grep caBundle
# 빈 문자열("")인데 ArgoCD diff에서는 base64 값이 있음
```

**해결**: `prometheus.yaml` (ArgoCD Application)에 ignoreDifferences 추가:
```yaml
ignoreDifferences:
  - group: admissionregistration.k8s.io
    kind: MutatingWebhookConfiguration
    jsonPointers:
      - /webhooks/0/clientConfig/caBundle
  - group: admissionregistration.k8s.io
    kind: ValidatingWebhookConfiguration
    jsonPointers:
      - /webhooks/0/clientConfig/caBundle
```

```bash
kubectl apply -f pawfiler4-argocd/infrastructure/observability/prometheus/prometheus.yaml
```

---

### 2. Grafana 트레이스 대시보드 No data — datasource 불일치

**증상**: Grafana의 traces 대시보드에서 Istio 메트릭 패널 모두 No data.

**원인**: 대시보드 패널의 datasource uid가 `amp`(Amazon Managed Prometheus)로 설정돼 있는데, Istio 메트릭은 로컬 Prometheus에서 수집 중. AMP에는 해당 메트릭이 없음.

**재현 방법**:
```bash
# 로컬 Prometheus에서 확인
kubectl port-forward svc/kube-prometheus-stack-prometheus -n monitoring 9091:9090
# http://localhost:9091에서 istio_requests_total{namespace="admin"} 조회 → 데이터 있음

# AMP에서는 없음 (scrape 대상이 아님)
```

**해결**: `pawfiler-traces.json` 대시보드에서 패널 1-4의 datasource uid를 `amp` → `prometheus`(로컬)로 변경.

```bash
# ConfigMap 업데이트 후 Grafana rollout restart
kubectl rollout restart deployment grafana -n monitoring
```

---

### 3. Tempo 트레이스 패널 No data — panel type 불일치

**증상**: Tempo 쿼리 결과가 있는데도 Grafana 패널에서 No data.

**원인**: 패널 타입이 `traces`로 설정돼 있는데, 이 타입은 단일 Trace ID로 조회한 플레임그래프 전용. TraceQL 리스트 쿼리에는 `table` 타입을 써야 함.

**해결**:
- 패널 타입: `traces` → `table`
- Table Format: `Traces`로 설정
- Query: `{resource.service.name=~"$service"}` → `{}` (서비스 이름 포맷이 `quiz-service.pawfiler`처럼 FQDN이라 변수 매칭 안 됨)

---

### 4. CI 빌드 실패 — no new variables on left side of :=

**증상**: user-service CI 빌드 실패:
```
./main.go:XX: no new variables on left side of :=
```

**원인**: `main()` 함수 상단에 이미 `ctx := context.Background()`가 있는데, tracing.Init 호출 코드를 추가하면서 중복으로 `ctx := context.Background()`를 삽입.

```go
// 기존 코드 (line ~49)
ctx := context.Background()

// 잘못 추가된 코드
ctx := context.Background()  // ← 중복 선언
shutdown, err := tracing.Init(ctx, "user-service")
```

**해결**: 중복 선언 제거. 기존 `ctx`를 그대로 사용.

```go
ctx := context.Background()
shutdown, err := tracing.Init(ctx, "user-service")
```

---

## 적용 대상 서비스

| 서비스 | 위치 | 서버 핸들러 | 클라이언트 핸들러 |
|--------|------|------------|-----------------|
| quiz-service | `backend/services/quiz` | ✓ | ✓ (userclient → user-service) |
| user-service | `backend/services/user` | ✓ | - |
| community-service | `backend/services/community` | ✓ | ✓ (userclient → user-service) |

---

## 검증

Tempo에서 트레이스 연결 확인:
```
TraceQL: {}
→ Service: istio-ingress.istio-ingress
→ Span: quiz-service.pawfiler (동일 Trace ID)
→ Span: user-service.pawfiler (동일 Trace ID) ← OTel SDK 추가 후
```

Tempo API로 직접 확인:
```bash
kubectl port-forward svc/tempo -n monitoring 3200:3200
curl "http://localhost:3200/api/search?tags=resource.service.name%3Dquiz-service"
```
