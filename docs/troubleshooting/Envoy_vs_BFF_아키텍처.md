# Troubleshooting: Envoy vs BFF 아키텍처 선택

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
