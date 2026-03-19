# PawFiler AI Orchestration — 비용 분석

## 현재 구성 (스팟 인스턴스)

### Pod 구성
- **Head Node (CPU)**: 1개 고정
- **GPU Worker**: 1~2개 (오토스케일)
- **Ray 에이전트**: 같은 Pod 내에서 프로세스로 동작 (별도 Pod 아님)

### 인스턴스 타입 및 비용

| 구분 | 인스턴스 | vCPU | RAM | GPU | 스팟 시간당 | 온디맨드 시간당 |
|------|----------|------|-----|-----|-------------|----------------|
| Head | c6i.xlarge | 4 | 8GB | - | ~$0.04 | ~$0.17 |
| Worker | g5.xlarge | 4 | 16GB | 1 | ~$0.30 | ~$1.01 |

### 시나리오별 월 비용 (24/7 가동)

#### 최소 구성 (Head 1 + Worker 1)
```
Head:    $0.04/hr × 730hr = $29/월
Worker:  $0.30/hr × 730hr = $219/월
─────────────────────────────────
합계:                       $248/월
```

#### 피크 구성 (Head 1 + Worker 2)
```
Head:    $0.04/hr × 730hr = $29/월
Worker:  $0.30/hr × 730hr × 2 = $438/월
─────────────────────────────────
합계:                       $467/월
```

#### 실제 예상 (평균 Worker 1.3개)
```
Head:    $0.04/hr × 730hr = $29/월
Worker:  $0.30/hr × 730hr × 1.3 = $285/월
─────────────────────────────────
합계:                       $314/월
```

## 비용 절감 전략

### 1. 스팟 인스턴스 (현재 적용 ✅)
- 온디맨드 대비 **70% 절감**
- 중단 위험: Ray가 자동 복구

### 2. 사용하지 않을 때 자동 종료
```yaml
# HPA 기반 스케일 다운 (트래픽 없으면 0으로)
spec:
  minReplicas: 0  # 트래픽 없으면 완전 종료
  maxReplicas: 2
```
→ 야간/주말 미사용 시 **비용 0**

### 3. Cascade 파이프라인 효과
- XGBoost가 80% 요청 처리 → GPU 미사용
- GPU 실제 사용률: ~20%
- **실질 GPU 비용: $219 × 0.2 = $44/월**

### 4. 더 작은 GPU 인스턴스
```
g5.xlarge  → g4dn.xlarge (1 GPU, $0.16/hr spot)
월 $219    → 월 $117 (47% 절감)
```
단, MobileViT는 가벼워서 g4dn으로도 충분

## 최종 권장 구성

### 개발/테스트 환경
```yaml
minReplicas: 0  # 사용 안 할 때 완전 종료
maxReplicas: 1
인스턴스: g4dn.xlarge (스팟)
```
**예상 비용: $0~50/월** (실제 사용 시간에 비례)

### 프로덕션 환경 (현재 설정)
```yaml
minReplicas: 1
maxReplicas: 2
인스턴스: g5.xlarge (스팟)
```
**예상 비용: $248~467/월** (트래픽에 따라)

## 추가 비용 항목

| 항목 | 월 비용 |
|------|---------|
| EFS (20GB) | ~$6 |
| ECR (이미지 저장) | ~$1 |
| 데이터 전송 (S3→EKS) | ~$5 |
| **총 인프라 비용** | **$260~480/월** |

## 비용 모니터링

```bash
# Karpenter 노드 비용 확인
kubectl get nodes -l karpenter.sh/capacity-type=spot -o custom-columns=\
NAME:.metadata.name,\
INSTANCE:.metadata.labels.node\\.kubernetes\\.io/instance-type,\
CAPACITY:.metadata.labels.karpenter\\.sh/capacity-type

# 실시간 비용 추적 (Kubecost 설치 시)
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
# http://localhost:9090
```

## 비용 알람 설정

```bash
# AWS Budget 생성
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json

# budget.json
{
  "BudgetName": "pawfiler-ai-monthly",
  "BudgetLimit": {
    "Amount": "500",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```
