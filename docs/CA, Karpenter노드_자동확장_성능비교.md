# Cluster Autoscaler vs Karpenter 실측 비교

> 측정일: 2026-03-18 | 클러스터: pawfiler-eks-cluster (EKS 1.31, ap-northeast-2)
> 기존에 사용하던 Cluster Autoscaler(CA)를 Karpenter로 전환한 후 실제 클러스터에서 측정한 결과

## 테스트 환경

| 항목 | 값 |
|------|-----|
| 클러스터 | EKS 1.31, ap-northeast-2 (서울) |
| 기본 노드 | t3.medium on-demand × 2 (AZ당 1개 고정) |
| 테스트 인스턴스 | t3a.medium spot (Karpenter가 자동 선택) |
| CA 측정 조건 | CPU 900m × 5 파드 배포 |
| Karpenter 측정 조건 | CPU 800m × 4 파드 배포 |

---

## 1. 노드 추가 속도 비교

CA는 스케줄러가 10초마다 주기적으로 스캔해서 결정하지만,
Karpenter는 Pending 파드가 생기는 즉시 이벤트로 감지한다.

| 단계 | CA | Karpenter |
|------|-----|-----------|
| Pending 감지 → 스케일 결정 | ~10s (10초 scan interval) | **<1s** (이벤트 기반, 즉시) |
| 결정 → EC2 launch API | ~5s | **3s** |
| EC2 launch → 노드 kubelet 등록 | ~30s | **26s** |
| 노드 등록 → 초기화 완료 | ~12s | **17s** |
| **Pod Pending → Running 전체** | **57초** | **47초** |

### Karpenter 로그 (UTC 기준)

```
02:55:36  Pod Pending 감지 → NodeClaim 2개 즉시 결정
02:55:39  EC2 launch API 호출 (결정 후 3초)
02:56:05  노드 kubelet 등록 완료 (launch 후 26초)
02:56:22  노드 초기화 완료 (launch 후 43초)
02:56:23  Pod Running (전체 47초)
```

---

## 2. 유휴 노드 반납 속도 비교

CA는 기본값이 매우 보수적이라 scale-down-unneeded-time(기본 10분) +
scale-down-delay-after-add(기본 10분)를 기다린다.
설정을 최소값으로 줄여도 bin-packing(파드 재배치)이 없어서
파드가 여러 노드에 분산된 경우 노드를 비울 수 없다.

**CA 최적 설정 (실용적 최솟값)**:
```
--scale-down-unneeded-time=2m
--scale-down-delay-after-add=3m   # 노드 Ready 보장을 위한 최소 대기
```
`delay-after-add=0s`로 줄이면 노드 추가 직후 삭제 시도로 레이스 컨디션 발생 가능.

| 항목 | CA 기본값 | CA 최적 설정 | Karpenter |
|------|-----------|-------------|-----------|
| `scale-down-unneeded-time` | 10분 | 2분 | — |
| `scale-down-delay-after-add` | 10분 | 3분 | 없음 |
| 파드 재배치 후 노드 비우기 | 불가 | 불가 | 가능 (`WhenEmptyOrUnderutilized`) |
| 어느 노드를 끌지 선택 | AWS ASG 내 자동 | AWS ASG 내 자동 | Karpenter가 특정 NodeClaim 지정 |
| **빈 노드 → 인스턴스 종료** | **20분+** | **~5~6분** | **~90초** |
| **CA 기본값 대비 속도** | 기준 | 3배 빠름 | **6배+ 빠름** |

### Karpenter 로그 (UTC 기준)

```
02:57:00  테스트 파드 전체 삭제
02:57:17  노드1 빈 노드 감지 → disruption 결정 (17초 후)
02:58:13  노드2 disruption 결정 (73초 후)
02:58:28  노드1 인스턴스 완전 종료 (파드 삭제 후 88초)
02:59:07  노드2 인스턴스 완전 종료 (파드 삭제 후 127초)
```

> consolidateAfter: 30s 설정. 노드 2개 순차 처리 → 전체 2분 내 완전 반납.

---

## 3. 구조적 차이

| 항목 | CA | Karpenter |
|------|-----|-----------|
| 작동 방식 | 10초 주기 polling | 즉시 이벤트 기반 |
| 노드 종류 결정 | ASG에 사전 정의된 타입 | 파드 CPU/메모리 기반 자동 선택 |
| Spot 중단 대응 | node-termination-handler 별도 설치 필요 | 내장 (SQS + EventBridge) |
| 비용 최적화 | ASG 수동 관리 | Bin-packing + Consolidation 자동 |

---

## 4. 현재 클러스터 구성

```
On-demand (고정 2개):  t3.medium — 2a, 2c AZ 각 1개 (서비스 기본 용량 보장)
Spot (동적, Karpenter): t3/t3a/m5/m5a medium·large 중 자동 선택
  consolidateAfter: 30s  — 빈 노드 30초 후 반납 시작
  expireAfter: 720h      — 30일마다 노드 교체 (보안 패치)
  CPU limit: 32 core / Memory limit: 64Gi
```

---

## 5. 결론

- **노드 추가**: Karpenter가 **17% 빠름** (47s vs 57s) — scan interval 제거가 핵심
- **노드 반납 (기본값 기준)**: Karpenter가 **10배+ 빠름** (2분 vs 20분+)
- **노드 반납 (CA 최적 설정 기준)**: Karpenter가 **6배+ 빠름** (90초 vs 5~6분)
- **CA 설정을 최소로 줄여도** bin-packing이 없어서 파드가 여러 노드에 분산된 경우 노드를 비울 수 없음 → 실제 비용 절감 효과 제한적
- Spot 워크로드, 동적 스케일링, 비용 최적화가 목적이라면 Karpenter가 적합
