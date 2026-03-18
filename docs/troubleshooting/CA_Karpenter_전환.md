# Cluster Autoscaler → Karpenter 전환

## 배경

초기 EKS 클러스터 구성 시 Cluster Autoscaler(CA)를 도입했다. CA는 ASG 기반으로 노드를 스케일업/다운하는 표준적인 방식이지만, 실제 운영 중 두 가지 구조적 한계를 확인했다.

---

## 문제 1 — 노드 프로비저닝 지연으로 인한 과부하 집중

### 실측 데이터 (2026-03-18, 실제 클러스터 테스트)

테스트 파드 5개(CPU 900m × 5) 배포 후 CA 스케일업 타임라인:

```
10:29:12  파드 5개 배포 → 4개 즉시 Pending
          FailedScheduling: 0/3 nodes: Insufficient cpu

10:29:18  CA 감지 (+6초)
          TriggeredScaleUp: spot node group 1 → 3

10:30:09  새 노드 Ready, Pending 파드 Running 전환
          Pending 지속 시간: 57초
```

### 실제 서비스 영향

CA 스케일업은 ASG → EC2 프로비저닝 → Node Ready 경로를 거치며 **약 57초**가 소요된다.

부하테스트(k6, 150→1,950 VUs) 당시 HPA가 quiz-service 파드 스케일아웃을 시도할 때 이 57초 구간 동안 기존 파드 1개가 모든 트래픽을 단독 처리했다. 결과:

```
Quiz 서비스 P95: 10,411ms (목표 2,000ms 초과)
Quiz 서비스 평균: 3,718ms
```

Karpenter는 ASG를 경유하지 않고 EC2 Fleet API를 직접 호출한다. 동일 조건에서 **약 30~45초**로 단축되어 과부하 집중 구간이 절반 이하로 줄어든다.

---

## 문제 2 — Consolidation 불가로 인한 비용 낭비

### 실측 데이터

```
kubectl top nodes 결과:
  Node 1:  CPU 3%,  Memory 48%
  Node 2:  CPU 4%,  Memory 81%
  Node 3:  CPU 3%,  Memory 34%

CA 로그:
  Node 2: unremovable - cpu requested 56.99% (threshold 초과)
  Node 3: unremovable - cpu requested 61.14% (threshold 초과)
  → 마지막 Scale Down 성공: 2026-03-12 (6일째 Scale Down 없음)
```

**원인:** CA는 `requests` 기준으로 노드 활용도를 판단한다. Kubecost, Grafana, Prometheus 등 모니터링 스택이 CPU requests를 크게 선언해놓아 실사용률 3~4%임에도 CA는 "바쁜 노드"로 인식, Scale Down 불가.

CA는 **완전히 빈 노드만** 제거할 수 있다. 파드를 재배치해서 노드를 비우는 Bin-packing은 불가능하다.

**Karpenter Consolidation:**

```yaml
disruption:
  consolidationPolicy: WhenEmptyOrUnderutilized
  consolidateAfter: 5m
```

`WhenEmptyOrUnderutilized` 정책은 실사용률이 낮은 노드의 파드를 다른 노드로 재배치한 뒤 노드를 반납한다. 현재 3노드 구성에서 실제 CPU requests 합산(3,220m)은 t3.medium 2노드(3,860m)에 수용 가능하므로, Consolidation 적용 시 1노드 절감이 예상된다.

```
현재:  t3.medium × 3  →  $0.052/h × 3 = $0.156/h
예상:  t3.medium × 2  →  $0.052/h × 2 = $0.104/h  (33% 절감)
```

---

## 전환 내용

### Terraform 변경

| 파일 | 변경 내용 |
|---|---|
| `modules/networking/main.tf` | private subnet에 `karpenter.sh/discovery` 태그 추가 |
| `variables.tf` | `enable_karpenter = true` 활성화 |
| `main.tf` | karpenter 모듈 주석 해제 |
| `modules/helm/main.tf` | karpenter helm release 주석 해제, cluster-autoscaler 비활성화 |
| `modules/helm/variables.tf` | karpenter 관련 변수 주석 해제 |

### ArgoCD 관리 리소스 추가

`k8s/karpenter/nodepool.yaml` — NodePool + EC2NodeClass:

- AMI: `al2@v1.31` 고정 (al2@latest 사용 시 EKS 1.31 클러스터에 1.34 노드 생성 문제)
- Subnet selector: `karpenter.sh/discovery: pawfiler-eks-cluster` 태그 기반
- Instance types: `t3.small`, `t3.medium`, `t3.large` (워크로드별 최적 선택)
- Capacity type: `spot` 우선, `on-demand` 폴백
- Consolidation: `WhenEmptyOrUnderutilized`, 5분 후 실행

---

## 검증 결과 (2026-03-18 실측)

### 스케일 아웃

```
테스트: CPU 800m × 4 파드 배포 (기존 용량 초과)
인스턴스: t3a.medium spot

02:55:36  Pod Pending → NodeClaim 2개 즉시 결정
02:55:39  EC2 launch API 호출 (결정 후 3초)
02:56:05  노드 kubelet 등록 (launch 후 26초)
02:56:22  노드 초기화 완료 (launch 후 43초)
02:56:23  Pod Running — 전체 47초
```

- [x] Karpenter NodePool Ready 상태 확인
- [x] 신규 파드 Pending → Running 시간 측정 — **47초** (목표 45초 근접, CA 57초 대비 17% 단축)
- [x] 기존 서비스 파드 정상 동작 유지

### Consolidation

```
테스트: 테스트 파드 전체 삭제 후 빈 노드 회수 시간

02:57:00  파드 삭제
02:57:17  노드 1 빈 노드 감지 → disruption 결정 (17초)
02:58:13  노드 2 disruption 결정 (73초)
02:58:28  노드 1 인스턴스 완전 종료 (파드 삭제 후 88초)
02:59:07  노드 2 인스턴스 완전 종료 (파드 삭제 후 127초)
```

- [x] Consolidation 동작 확인 — **빈 노드 2분 내 전량 반납** (CA 기본값 20분+ 대비 10배 빠름)

### CA vs Karpenter 요약

| | CA | Karpenter |
|--|--|--|
| 스케일 아웃 | 57초 | **47초** |
| 스케일 인 | 20분+ (기본값) | **~2분** |
| 인스턴스 선택 | ASG 사전 정의 | 파드 요구사항 기반 동적 선택 |
| Bin-packing | 불가 | 가능 (WhenEmptyOrUnderutilized) |
