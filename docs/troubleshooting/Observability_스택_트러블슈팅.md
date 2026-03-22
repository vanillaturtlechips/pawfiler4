# Observability 스택 구축 및 트러블슈팅

> **문서 작성 원칙**: 이 문서는 반드시 **성과 중심**으로 작성한다.
> 트러블슈팅 내용을 추가할 때는 항상 상단 "성과 요약" 테이블을 먼저 업데이트할 것.
> Before / After / 효과(수치) 세 컬럼을 모두 채워야 한다.
> 각 트러블슈팅 항목에는 반드시 **재현 방법**을 포함할 것. 같은 문제를 다시 만났을 때 확인 절차 없이 처음부터 디버깅하는 일이 없어야 한다.

## 성과 요약

> 서울 리전(ap-northeast-2) S3 스토리지 $0.025/GB/월, 데이터 전송 $0.09/GB 기준 추정

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| 로그 수집 범위 | 클러스터 전체 ~90개 파드 | pawfiler 네임스페이스 ~11개 파드 | **수집량 89% 감소** |
| S3 스토리지 비용 | Loki retention 7일 | retention 3일 | **스토리지 비용 ~57% 절감** |
| ArgoCD CPU | application-controller 1274m (비정상) | 317m (정상 범위) | **75% 감소**, sync 반복 실패 해소 |
| ArgoCD Sync 안정성 | external-secrets OutOfSync 무한 반복 | Synced/Healthy 유지 | CRD 256KB annotation 한도 문제 해결 |
| 보안 | Grafana admin 패스워드 평문 ConfigMap | Kubernetes Secret 참조 | 크리덴셜 평문 노출 제거 |
| 로그 파이프라인 | 없음 | Fluent-bit → Loki → Grafana | 서비스 로그 실시간 조회 및 장애 대응 가능 |

---

## 스택 구성

```
파드 로그 → Fluent-bit (DaemonSet) → Loki (S3 백엔드) → Grafana
```

| 컴포넌트 | 역할 | 선택 이유 |
|---------|------|---------|
| Fluent-bit | 각 노드에서 파드 로그 수집 | 경량 (파드당 5~7Mi), 풍부한 필터 기능 |
| Loki | 로그 저장 및 쿼리 | S3 백엔드로 저렴, Grafana 네이티브 연동 |
| Grafana | 로그 시각화 및 쿼리 UI | Loki/Prometheus 통합 대시보드 |

**설계 원칙**: 수집 범위를 서비스 네임스페이스(pawfiler)로 한정해 비용과 노이즈를 최소화.

---

## 트러블슈팅

### 1. Loki StatefulSet PVC 권한 오류 - securityContext 미설정

**재현 방법**
```bash
kubectl logs -n monitoring loki-0
# "permission denied" 확인
kubectl describe pod -n monitoring loki-0 | grep -A5 "Events"
```

**증상**
```
loki-0   0/1   CrashLoopBackOff   51 (2m18s ago)   3h58m
mkdir /loki/index_cache: permission denied
```

**원인**

StatefulSet에 `securityContext.fsGroup`이 없으면 PVC 볼륨이 root(UID 0) 소유로 마운트된다. Loki 공식 이미지는 non-root(UID 10001)로 실행되기 때문에 쓰기 권한이 없다.

`fsGroup`을 나중에 추가해도 이미 생성된 PVC의 소유권은 변경되지 않는다. PVC는 처음 생성될 때 소유권이 결정되고, 이후 `fsGroup` 변경은 새로 마운트되는 볼륨에만 적용된다. non-root 컨테이너 + StatefulSet + PVC 조합에서 흔히 발생하는 문제다.

**해결 - initContainer로 권한 강제 변경**
```yaml
initContainers:
- name: fix-permissions
  image: busybox
  command: ["sh", "-c", "chown -R 10001:10001 /loki"]
  volumeMounts:
  - name: storage
    mountPath: /loki
  securityContext:
    runAsUser: 0
```
파드 시작 전 root로 볼륨 소유권을 변경해서 해결.

---

### 2. Loki 3.x S3 설정 Breaking Change

**재현 방법**
```bash
kubectl logs -n monitoring loki-0
# "InvalidParameter" 또는 "GetObjectInput.Bucket" 확인
```

**증상**
```
InvalidParameter: minimum field size of 1, GetObjectInput.Bucket
```

**원인**

Loki 3.0에서 S3 설정 스키마가 변경됐다. 2.x에서 사용하던 단일 URL 방식(`s3://bucket-name`)을 그대로 사용하면 버킷명 파싱에 실패해 빈 문자열이 전달된다. 공식 마이그레이션 가이드에서도 이 변경이 명확히 안내되지 않아 버전 업그레이드 시 많이 겪는 문제다.

**해결**
```yaml
# 변경 전 (Loki 2.x 방식)
aws:
  s3: s3://pawfiler-loki-chunks

# 변경 후 (Loki 3.x 방식)
aws:
  bucketnames: pawfiler-loki-chunks
  region: ap-northeast-2
```

---

### 3. Fluent-bit 기본 설정으로 전체 클러스터 로그 수집 - S3 비용 낭비

**재현 방법**
```bash
kubectl get configmap -n monitoring fluent-bit-config -o yaml | grep -A5 "FILTER"
# namespace 조건 없으면 전체 수집 중
```

**증상**

Fluent-bit 기본 설정은 클러스터 전체 로그를 수집한다. 실제 서비스 파드(pawfiler)는 전체의 약 11%에 불과했다.

| 네임스페이스 | 파드 수 | 비고 |
|-------------|--------|------|
| kube-system | ~30개 | aws-node, ebs-csi, kube-proxy 등 |
| monitoring | ~20개 | fluent-bit, prometheus, grafana 등 |
| argocd | 7개 | ArgoCD 컴포넌트 |
| 기타 시스템 | ~14개 | external-secrets, honeybeepf, karpenter |
| **pawfiler** | **11개** | **실제 서비스 파드** |

**원인**

Fluent-bit의 기본 `[INPUT] tail` 설정은 `/var/log/containers/*.log` 전체를 수집한다. 별도 필터를 추가하지 않으면 시스템 파드 로그까지 모두 Loki로 전송되어 S3 비용이 불필요하게 증가한다. 로그 파이프라인 초기 구성 시 필터링 범위를 명시적으로 설계하지 않으면 누구나 빠지는 함정이다.

**해결**

Fluent-bit에 네임스페이스 필터 추가:
```ini
[FILTER]
    Name    grep
    Match   kube.*
    Regex   $kubernetes['namespace_name'] pawfiler
```
→ 로그 수집량 약 **89% 감소**, S3 비용 대폭 절감

---

### 4. Fluent-bit Merge_Log 파싱 후 필드 소실로 필터 미작동

**재현 방법**
```bash
# Grafana에서 {job="fluentbit"} 쿼리 후 /health, /ready 로그 존재 여부 확인
kubectl logs -n monitoring -l app=fluent-bit | grep "cannot increase buffer"
```

**증상**

네임스페이스 필터 적용 후에도 health check 로그가 계속 수집됨:
```
INFO: 10.0.3.55:30974 - "GET /health HTTP/1.1" 200 OK
```

**원인**

`Merge_Log On` 설정 시 컨테이너 로그가 JSON으로 파싱되면서 원본 `log` 필드가 최상위 키들로 분해된다. 이후 `Exclude log` 패턴을 적용하는 시점에는 `log` 필드 자체가 사라진 상태라 매칭이 동작하지 않는다.

Fluent-bit의 필터 처리 순서와 `Merge_Log`의 동작 방식을 정확히 이해하지 않으면 발생하는 문제로, 공식 문서에도 이 동작이 명확히 설명되어 있지 않다.

**해결**
```ini
[FILTER]
    Name    grep
    Match   kube.*
    Exclude log /health
    Exclude log /ready
    Exclude log /ping
```

---

### 5. ArgoCD client-side apply로 인한 CRD 256KB annotation 한도 초과

**재현 방법**
```bash
kubectl top pod -n argocd
# application-controller CPU 400m 초과 시 의심
kubectl describe application -n argocd | grep "metadata.annotations: Too long"
```

**증상**
```
argocd-application-controller-0   1274m   (정상 200~400m)
Failed sync attempt: CustomResourceDefinition "clustersecretstores.external-secrets.io"
is invalid: metadata.annotations: Too long: must have at most 262144 bytes
```

**원인**

kubectl의 기본 apply 방식(client-side apply)은 이전 상태 전체를 `kubectl.kubernetes.io/last-applied-configuration` annotation에 저장한다. external-secrets처럼 스펙이 큰 CRD는 이 annotation이 쿠버네티스의 256KB 한도를 초과한다.

ArgoCD는 sync 실패 시 계속 재시도하기 때문에 CPU가 지속적으로 점유된다. CRD가 많은 Operator 계열 Helm chart를 ArgoCD로 관리할 때 반드시 만나는 문제다.

```
client-side apply: annotation에 CRD 전체 저장 → 300KB+ → 한도 초과 → sync 무한 실패
server-side apply: 필드 소유권만 추적 → annotation 크기 문제 없음
```

**해결**

ArgoCD Application에 `ServerSideApply=true` 추가:
```yaml
syncOptions:
  - ServerSideApply=true
```

---

### 6. ArgoCD cert-controller 런타임 주입 필드로 인한 OutOfSync 무한 반복

**재현 방법**
```bash
kubectl get application -n argocd external-secrets
# STATUS: OutOfSync 확인
argocd app diff external-secrets
# caBundle 필드가 diff에 잡히는지 확인
```

**증상**
```
external-secrets   OutOfSync   Healthy
argocd-application-controller-0   1274m+   CPU 지속
```

**원인**

external-secrets의 `cert-controller`는 런타임에 `ValidatingWebhookConfiguration`의 `caBundle` 필드에 TLS 인증서를 자동 주입한다. ArgoCD는 Git에 없는 이 필드를 diff로 감지해 sync를 시도하고, sync하면 caBundle이 제거되고, cert-controller가 다시 주입하는 무한 반복이 발생한다.

cert-manager, external-secrets, Istio 등 자체 인증서를 관리하는 컴포넌트를 ArgoCD로 관리할 때 공통적으로 발생하는 구조적 문제다.

```yaml
# Git 정의 (caBundle 없음)
clientConfig:
  service: ...

# 클러스터 실제 상태 (cert-controller 자동 주입)
clientConfig:
  caBundle: LS0tLS1CRUdJTi...
  service: ...
```

**해결**

`ignoreDifferences`로 런타임 자동 주입 필드를 diff 비교에서 제외:

```yaml
ignoreDifferences:
  - group: admissionregistration.k8s.io
    kind: ValidatingWebhookConfiguration
    jsonPointers:
      - /webhooks/0/clientConfig/caBundle
      - /webhooks/1/clientConfig/caBundle
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/template/metadata/annotations
      - /spec/progressDeadlineSeconds
      - /spec/revisionHistoryLimit
      - /spec/strategy
syncOptions:
  - RespectIgnoreDifferences=true
```

---

## 향후 개선 사항

### 구조화 로깅 (slog 도입)

현재 Go 서비스들이 평문 로그를 출력해 Grafana에서 레벨별 필터링이 불가능하다.
```
2026/03/20 06:46:51 Loaded 27 questions from database into memory
```
`log/slog`로 교체하면 JSON 구조화 로그로 레벨별 필터링이 가능해진다.
```json
{"time":"2026-03-20T06:46:51Z","level":"INFO","msg":"Loaded 27 questions","count":27}
```

### 로그 레벨별 Retention 전략

| 레벨 | 보관 기간 | 비고 |
|------|----------|------|
| ERROR | 30일 | 장애 원인 분석 |
| WARN | 14일 | 이상 징후 추적 |
| INFO | 3일 | 현재 적용 중 |
| 결제/보안 | 5년 | 전자금융거래법 의무 (실서비스 기준) |

### 분산 트레이싱 도입 검토

현재 서비스 간 요청 흐름 추적이 불가능하다. Istio(사이드카) + OpenTelemetry Collector + Grafana Tempo 조합으로 코드 수정 없이 분산 트레이싱 구현 가능. 전 서비스 적용 및 리소스 증가를 고려해 팀 합의 후 진행 예정.
