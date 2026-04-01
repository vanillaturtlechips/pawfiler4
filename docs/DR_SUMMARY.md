# PawFiler DR 전략 요약

> 작성일: 2026-03-30
> 환경: AWS ap-northeast-2 (서울)

---

## 1. DR이 필요한 이유 (당위성)

### 서비스 특성
PawFiler는 딥페이크 탐지 교육 플랫폼으로, **사용자의 퀴즈 기록·XP·코인·영상 분석 결과**가 핵심 자산이다.
이 데이터가 손실되면 사용자가 쌓은 학습 이력 전체가 사라진다.

### 현재 인프라의 구조적 취약점

| 컴포넌트 | 현재 설정 | 위험 |
|---------|-----------|------|
| RDS PostgreSQL | Single-AZ, `skip_final_snapshot=true` | AZ 장애 시 DB 전면 다운 + 데이터 영구 소실 가능 |
| NAT Gateway | 단일 AZ (ap-northeast-2a) | NAT 장애 시 EKS → Cognito/Bedrock/SageMaker 전부 단절 |
| Redis | EKS emptyDir (인메모리) | 노드 재시작마다 캐시 초기화 |
| S3 videos 버킷 | Versioning 없음 | 사용자 업로드 영상 실수 삭제 시 복구 불가 |

### 장애 발생 시 실제 영향
```
RDS AZ 장애 발생
  → 모든 서비스(퀴즈/커뮤니티/분석/챗봇) 동시 다운
  → 수동 복구 시 20~30분 소요
  → 마지막 백업 이후 데이터 전부 손실
  → 사용자 재방문 이탈 + 서비스 신뢰도 하락
```

---

## 2. DR 목표

| 지표 | 정의 | PawFiler 목표 |
|------|------|--------------|
| **RTO** (복구 시간 목표) | 장애 발생 → 서비스 복구까지 허용 시간 | **30분 이내** |
| **RPO** (데이터 손실 허용 범위) | 복구 시 허용 가능한 데이터 손실 시점 | **5분 이내** |

---

## 3. 재해 시나리오 4단계

```
Tier 1 │ 단순 장애    │ 자동 복구           │ EKS 파드 크래시, Spot 회수
Tier 2 │ 복합 장애    │ 알림 후 반자동 복구  │ RDS Failover (Multi-AZ), ArgoCD 재시작
Tier 3 │ 대규모 장애  │ Step Functions 자동화│ EKS 전체 재구축, RDS 스냅샷 복원
Tier 4 │ 리전 전체 장애│ Cross-Region 전환   │ ap-northeast-2 전체 불가
```

---

## 4. 핵심 DR 구성 요소

### 4-1. RDS Multi-AZ (가장 중요)

```
현재:  Primary DB (ap-northeast-2a) 단독 운영
목표:  Primary (2a) ──동기복제──▶ Standby (2c)
                                      ↑
                              장애 시 자동 승격 (60~120초)

RPO: 0 (동기 복제 = 데이터 손실 없음)
RTO: 2분 (AWS 자동 Failover)
비용: +$15/월
```

Terraform 수정 사항:
```hcl
multi_az                = true
skip_final_snapshot     = false
backup_retention_period = 7
deletion_protection     = true
```

### 4-2. Step Functions + Lambda DR 자동화

```
장애 감지 흐름:
CloudWatch Alarm
  → EventBridge Rule
  → Step Functions State Machine 시작
  → SNS → Slack 알림 (운영자 승인 or 30분 자동 진행)
  → Lambda 단계별 실행
       ├── dr-detect      : 장애 유형 파악
       ├── dr-rds-recover : RDS Failover 확인 or 스냅샷 복원
       ├── dr-app-rollback: ArgoCD 이전 태그로 롤백
       └── dr-verify      : 헬스체크 통과 확인
  → 전체 복구 이력 CloudWatch Logs 기록
```

### 4-3. Route53 Health Check + DNS Failover

```
정상 상태:
  api.pawfiler.site → ALB (ap-northeast-2) [Primary]

장애 시 (Health Check 3회 실패 = 90초):
  api.pawfiler.site → ALB (ap-southeast-1) [Secondary, Pilot Light]

DNS TTL: 60초
총 전환 시간: ~2.5분
```

### 4-4. AWS Backup + Vault Lock

```
백업 대상: RDS, S3 videos, S3 quiz-media, S3 community-media
일일 백업: 매일 KST 02:00, 90일 보관
주간 백업: 매주 일요일, 365일 보관
Cross-Region 복사: ap-southeast-1 (30일 보관)

Vault Lock (WORM):
  → 한번 저장된 백업은 AWS Support도 삭제 불가
  → 랜섬웨어 공격 시 복구 가능
```

### 4-5. EKS 고가용성

EKS는 ArgoCD GitOps 덕분에 **전체 재구축해도 20분 내 자동 복원** 가능:
```
terraform apply         → EKS 재생성 (~10분)
kubectl apply applicationset.yaml
  → ArgoCD가 Git에서 모든 서비스 자동 배포 (~5분)
  → External Secrets가 Parameter Store에서 시크릿 자동 주입
```

추가 적용 항목:
- **PodDisruptionBudget**: 롤링 업데이트 중 최소 1개 파드 유지
- **Topology Spread**: 파드를 ap-northeast-2a/2c에 균등 분산
- **Karpenter**: Spot + On-Demand 폴백, 2개 AZ 분산

---

## 5. 단계별 구현 로드맵

### Phase 1 — 즉시 적용 (비용 $3/월 추가)

| 작업 | 효과 |
|------|------|
| RDS `skip_final_snapshot=false` | 삭제 시 스냅샷 강제 보존 |
| RDS `deletion_protection=true` | 실수 삭제 방지 |
| RDS `backup_retention_period=7` | 7일 자동 백업 |
| S3 videos 버킷 Versioning 추가 | 사용자 영상 실수 삭제 복구 |

### Phase 2 — 2주 내 (비용 +$22/월)

| 작업 | 효과 |
|------|------|
| RDS Multi-AZ 활성화 | RTO 30분 → 2분, RPO 0 |
| CloudWatch Alarm + SNS + Slack | 장애 3분 내 알림 |
| AWS Backup Plan + Vault Lock | 랜섬웨어 대응 + 1년 보관 |
| Step Functions + Lambda 구현 | 복구 자동화 |

### Phase 3 — 1개월 내 (비용 +$9/월)

| 작업 | 효과 |
|------|------|
| Route53 Health Check + Failover | DNS 자동 전환 (~2.5분) |
| S3 Cross-Region Replication | ap-southeast-1 백업 복사 |
| PDB + Topology Spread 적용 | EKS AZ 분산 |
| FIS 월간 DR 드릴 자동화 | 실제 RTO 측정 + 검증 |

### Phase 4 — 선택 (비용 +$120/월)

| 작업 | 효과 |
|------|------|
| Cross-Region Pilot Light (ap-southeast-1) | 리전 전체 장애 대응 |
| RDS Cross-Region Read Replica | 해외 리전 데이터 복제 |

---

## 6. DR 준비도 점수 변화

| 카테고리 | 현재 | Phase 1+2 후 | Phase 1~3 후 |
|---------|------|------------|------------|
| 데이터 보호 (RDS) | 2/10 | 8/10 | 9/10 |
| 데이터 보호 (S3) | 5/10 | 7/10 | 9/10 |
| 가용성 (EKS) | 7/10 | 7/10 | 9/10 |
| 자동화 | 2/10 | 7/10 | 8/10 |
| 모니터링 | 5/10 | 8/10 | 9/10 |
| DR 드릴 | 0/10 | 3/10 | 8/10 |
| **전체** | **3.5/10** | **6.7/10** | **8.7/10** |

---

## 7. 비용 요약

| 단계 | 월 추가 비용 | 누적 추가 비용 | 핵심 효과 |
|------|------------|------------|---------|
| Phase 1 | +$3 | +$3 | 데이터 보호 최소 안전망 |
| Phase 2 | +$22 | +$25 | RTO 2분 달성, 자동화 복구 |
| Phase 3 | +$9 | +$34 | DNS 자동 전환, 드릴 검증 |
| Phase 4 | +$120 | +$154 | 리전 장애 완전 대응 |

> **Phase 1~3 완료 시**: 월 $34 추가로 DR 점수 3.5 → 8.7 달성
