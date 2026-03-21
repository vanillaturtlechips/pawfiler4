# Troubleshooting: Envoy vs BFF 아키텍처 선택 → gRPC Gateway 전환

## 문제 상황

gRPC 백엔드와 REST API 프론트엔드 간 통신 방식을 결정해야 했습니다.

**두 가지 선택지:**
1. **BFF (Backend for Frontend)**: Node.js 서버에서 gRPC → REST 변환
2. **Envoy Proxy**: gRPC-JSON transcoding으로 직접 변환

## 시도한 방법

### 1. BFF 패턴 (초기 구현)

```
Frontend (REST) → BFF (Node.js) → gRPC Services
```

**구현:**
- `backend/bff/server.js`에 Express + gRPC 클라이언트
- 각 REST 엔드포인트마다 gRPC 호출 코드 작성

**문제점:**
- ❌ 서비스마다 BFF 코드 수동 작성 필요
- ❌ Proto 변경 시 BFF도 함께 수정
- ❌ 추가 레이어로 인한 레이턴시 증가
- ❌ BFF 서버 관리 부담 (배포, 스케일링)
- ❌ 에러 처리 로직 중복

### 2. Envoy Proxy (최종 선택)

```
Frontend (REST) → Envoy Proxy → gRPC Services
```

**구현:**
- Envoy의 gRPC-JSON transcoding 필터 사용
- Proto descriptor를 ConfigMap으로 마운트
- REST → gRPC 자동 변환

## 해결 방법

### Envoy 설정

```yaml
# envoy.yaml
http_filters:
  - name: envoy.filters.http.grpc_json_transcoder
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_json_transcoder.v3.GrpcJsonTranscoder
      proto_descriptor: "/etc/envoy/proto.pb"
      services:
        - "quiz.QuizService"
        - "community.CommunityService"
      print_options:
        add_whitespace: true
        always_print_primitive_fields: true
        always_print_enums_as_ints: false
        preserve_proto_field_names: false
```

### Proto Descriptor 생성

```bash
protoc --include_imports \
  --include_source_info \
  --descriptor_set_out=proto.pb \
  quiz.proto community.proto
```

### ConfigMap으로 마운트

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: proto-descriptor
data:
  proto.pb: |
    <base64 encoded descriptor>
```

## 결과

**Envoy 선택 이유:**
- ✅ **자동 변환**: Proto만 업데이트하면 끝
- ✅ **코드 제거**: BFF 서버 전체 삭제 (500+ 줄)
- ✅ **성능 향상**: 중간 레이어 제거
- ✅ **유지보수 간소화**: Envoy 설정만 관리
- ✅ **표준화**: 업계 표준 패턴

**성능 비교:**
```
BFF 패턴:     Frontend → BFF (Node.js) → gRPC Service
              ~50ms      ~30ms           ~20ms
              총 100ms

Envoy 패턴:   Frontend → Envoy → gRPC Service
              ~50ms      ~5ms    ~20ms
              총 75ms (25% 개선)
```

## 교훈

1. **간단한 것이 최선**: BFF는 복잡한 비즈니스 로직이 필요할 때만 사용
2. **표준 도구 활용**: Envoy 같은 검증된 프록시 사용
3. **유지보수 고려**: 코드가 적을수록 버그도 적음

## 참고

- BFF 코드 삭제 커밋: `backend/bff/` 디렉토리 제거
- Envoy 설정: `backend/envoy/envoy.yaml`
- Proto descriptor: `k8s/proto-configmap.yaml`

---

## 3차 전환: Envoy → gRPC Gateway (Embedded) 적용

### 문제 상황 (Envoy 운영 중 발생)

Envoy가 성능은 좋았지만 운영하면서 관리 부담이 너무 컸음:

- ❌ **Proto 변경할 때마다** descriptor 재생성 → ConfigMap 업데이트 → Envoy 재시작 필요
- ❌ **별도 인프라 관리**: Envoy 컨테이너 배포/스케일링/모니터링 따로 챙겨야 함
- ❌ **디버깅 어려움**: 요청이 Envoy 거치면서 에러 추적이 복잡해짐
- ❌ **설정 복잡도**: YAML 설정 실수 하나로 전체 API 먹통

### 해결 방법: gRPC Gateway 각 서비스에 내장

Envoy를 제거하고 각 gRPC 서비스 코드에 직접 HTTP/REST → gRPC 변환 레이어를 내장.

```
기존: Frontend → Envoy (별도 프로세스) → gRPC Service
변경: Frontend → gRPC Service (HTTP gateway 내장)
```

**구현 방식:**
- `grpc-gateway` 라이브러리를 각 서비스에 추가
- Proto 파일에 `google.api.http` 옵션으로 REST 매핑 정의
- 서비스 시작 시 HTTP 서버와 gRPC 서버를 동시에 실행

```protobuf
// proto에 HTTP 매핑 추가
import "google/api/annotations.proto";

service QuizService {
  rpc GetQuiz(GetQuizRequest) returns (GetQuizResponse) {
    option (google.api.http) = {
      get: "/v1/quiz/{id}"
    };
  }
}
```

### 성능 비교 (최종)

```
BFF 패턴:          Frontend → BFF (Node.js) → gRPC Service
                   ~50ms      ~30ms           ~20ms
                   총 100ms

Envoy 패턴:        Frontend → Envoy → gRPC Service
                   ~50ms      ~5ms    ~20ms
                   총 75ms (25% 개선)

gRPC Gateway:      Frontend → gRPC Service (gateway 내장)
                   ~50ms      ~2ms (in-process)  ~20ms
                   총 ~72ms (Envoy 대비 소폭 개선)
```

레이턴시 차이는 ~3ms로 미미하지만, **운영 복잡도가 크게 줄어든 게 핵심**.

### 결과

- ✅ **Envoy 인프라 제거**: 별도 관리 포인트 없앰
- ✅ **Proto 변경 → 코드 재빌드만 하면 끝**: descriptor 재생성 불필요
- ✅ **디버깅 단순화**: 요청 흐름이 단일 프로세스 내에서 끝남
- ✅ **배포 단순화**: 서비스 하나만 배포하면 HTTP + gRPC 동시 처리
- ⚠️ **트레이드오프**: 서비스 코드에 gateway 의존성 추가됨, 서비스별 독립 스케일링 불가

### 교훈 추가

4. **인프라 복잡도 vs 성능**: 3ms 성능 이득보다 운영 단순화가 더 가치 있을 수 있음
5. **Envoy는 대규모 MSA에 적합**: 서비스 수가 적으면 오버엔지니어링이 될 수 있음
