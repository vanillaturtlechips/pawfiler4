# PawFiler DR (Disaster Recovery) 계획

> 작성일: 2026-03-30
> 대상 환경: AWS ap-northeast-2 (서울 리전)
> 서비스: pawfiler.site (딥페이크 탐지 교육 플랫폼)

---

## 목차

1. [현재 인프라 취약점 분석 (Gap Analysis)](#1-현재-인프라-취약점-분석)
2. [DR 목표 (RTO / RPO)](#2-dr-목표)
3. [재해 시나리오 분류](#3-재해-시나리오-분류)
4. [컴포넌트별 DR 방안](#4-컴포넌트별-dr-방안)
5. [자동화 아키텍처 (Step Functions + Lambda)](#5-자동화-아키텍처)
6. [Route53 Failover 설계](#6-route53-failover-설계)
7. [AWS Backup 전략](#7-aws-backup-전략)
8. [복구 Runbook (단계별 절차)](#8-복구-runbook)
9. [DR 드릴 계획](#9-dr-드릴-계획)
10. [구현 우선순위 로드맵](#10-구현-우선순위-로드맵)

---

## 1. 현재 인프라 취약점 분석

### 1-1. 현재 상태 요약

| 컴포넌트 | 현재 설정 | 위험도 | 문제점 |
|---------|-----------|--------|--------|
| **RDS PostgreSQL** | `multi_az = false`, `skip_final_snapshot = true` | **Critical** | AZ 장애 시 데이터베이스 전체 다운. 스냅샷 없이 삭제 가능 |
| **Redis** | EKS emptyDir (인메모리) | High | 파드/노드 재시작 시 전체 캐시 소실. 영속성 없음 |
| **NAT Gateway** | 단일 AZ (ap-northeast-2a) | High | NAT GW 장애 시 Private Subnet → 인터넷 연결 전면 차단 |
| **EKS 노드** | Karpenter Spot (단일 AZ 편중 가능) | Medium | Spot 회수 동시 발생 시 서비스 중단 |
| **S3** | versioning 일부만 활성화 (quiz-media, community-media만) | Medium | frontend, videos, reports 버킷은 실수 삭제 복구 불가 |
| **Cognito** | AWS 관리형 서비스 | Low | AWS 리전 장애 시 인증 불가 (대안 없음) |
| **ArgoCD** | 단일 파드 | Medium | ArgoCD 다운 시 GitOps 배포 파이프라인 중단 |

### 1-2. 가장 심각한 단일 장애점 (SPOF)

```
1순위: RDS Single-AZ
  → DB 서버 하드웨어 장애 시 복구 시간: 20~30분 (수동 스냅샷 복원 기준)
  → 데이터 손실 가능 시간: 마지막 자동 백업 이후 모든 트랜잭션

2순위: NAT Gateway (단일 AZ)
  → ap-northeast-2a AZ 장애 시 EKS Private 노드 → 외부 API (Cognito, Bedrock, SageMaker) 연결 불가

3순위: Redis emptyDir
  → 노드 재시작마다 좋아요 카운터 캐시 초기화 → DB 부하 급증
```

---

## 2. DR 목표

### 2-1. RTO / RPO 정의

| 항목 | 정의 | PawFiler 목표 |
|------|------|--------------|
| **RTO** (Recovery Time Objective) | 장애 발생부터 서비스 복구까지 허용 시간 | **30분 이내** |
| **RPO** (Recovery Point Objective) | 복구 시 허용 가능한 데이터 손실 범위 | **5분 이내** |

### 2-2. 시나리오별 목표

| 시나리오 | 목표 RTO | 목표 RPO | 현재 달성 가능 여부 |
|---------|---------|---------|-----------------|
| EKS 노드 장애 (일부) | 5분 | 0 (상태 없음) | ✅ Karpenter 자동 복구 |
| EKS 전체 클러스터 장애 | 20분 | 0 | ⚠️ Terraform 재구축 필요 |
| RDS 장애 (현재 Single-AZ) | 30분 | 최대 30분 손실 | ❌ Multi-AZ 전환 필요 |
| RDS 장애 (Multi-AZ 적용 후) | 2분 | 0 (동기 복제) | ✅ 자동 Failover |
| S3 파일 실수 삭제 | 5분 | 0 (버저닝) | ⚠️ quiz-media, community-media만 |
| 전체 리전 장애 | 60분 | 최대 1시간 | ❌ Cross-Region 미구성 |
| 랜섬웨어/데이터 손상 | 1시간 | 24시간 | ❌ Backup Vault Lock 미구성 |

---

## 3. 재해 시나리오 분류

### Tier 1: 단순 장애 (자동 복구 가능)
- EKS 파드 크래시 → Kubernetes 자동 재시작
- Karpenter Spot 회수 → 새 노드 자동 프로비저닝 (3~5분)
- RDS 일시적 연결 오류 → RDS Proxy 커넥션 재시도

### Tier 2: 복합 장애 (반자동 복구 - 알림 + 승인 후 자동)
- RDS AZ 장애 (Multi-AZ 적용 시) → 60~120초 자동 Failover
- ArgoCD 파드 장애 → Helm 재배포 또는 `kubectl rollout restart`
- NAT GW 장애 → 보조 NAT GW 전환 (수동 Route Table 변경)

### Tier 3: 대규모 장애 (수동 복구 - Step Functions 트리거 후 단계적 자동화)
- EKS 클러스터 전체 삭제/손상 → Terraform 재구축
- RDS 데이터 손상/삭제 → 스냅샷 복원
- S3 버킷 실수 삭제 → 버전 복원 또는 Cross-Region 복사본 복원

### Tier 4: 리전 전체 장애 (Cross-Region Failover)
- ap-northeast-2 전체 서비스 불가 → ap-southeast-1 (싱가포르) Pilot Light 전환

---

## 4. 컴포넌트별 DR 방안

### 4-1. RDS PostgreSQL

#### 현재 (위험)
```hcl
multi_az             = false
skip_final_snapshot  = true
```

#### 목표 설정
```hcl
# terraform/modules/rds/main.tf 수정 필요
multi_az                = true   # 동기 복제 Standby AZ 생성
skip_final_snapshot     = false  # 삭제 시 최종 스냅샷 강제
backup_retention_period = 7      # 7일 자동 백업 유지
backup_window           = "17:00-18:00"  # UTC (한국 새벽 2~3시)
maintenance_window      = "Sun:18:00-Sun:19:00"
deletion_protection     = true   # 실수 삭제 방지
```

#### Failover 동작 원리
```
정상 상태:
  Primary DB (ap-northeast-2a) ←──동기 복제──→ Standby DB (ap-northeast-2c)
        ↑
  RDS Proxy (커넥션 풀링)
        ↑
  EKS 서비스들 (External Secrets로 DB Host 주입)

장애 발생 시:
  Primary DB 장애 감지 (AWS 내부 헬스체크)
        ↓ 60~120초
  Standby → Primary 자동 승격
        ↓
  RDS Proxy 엔드포인트 자동 재연결 (애플리케이션 변경 없음)
  → Parameter Store의 /pawfiler/db/host는 RDS Proxy 엔드포인트이므로 변경 불필요
```

#### RPO/RTO
- **RPO: 0** (동기 복제 - 데이터 손실 없음)
- **RTO: 60~120초** (AWS 자동 Failover)

---

### 4-2. Redis (캐시)

#### 현재 (위험)
```yaml
# Redis가 EKS emptyDir로 운영
# 파드 재시작 = 모든 캐시 소실
volumes:
  - name: redis-data
    emptyDir: {}
```

#### 단기 대응 (Graceful Degradation)
Redis가 없어도 서비스가 동작하도록 이미 코드에 폴백 구현됨:
```go
// like.go - Redis 없을 때 DB 직접 업데이트 (현재 코드 확인됨)
} else {
    h.db.ExecContext(ctx, "UPDATE community.posts SET likes = likes + 1 WHERE id = $1", req.PostId)
}
```
→ 현재 구조에서 Redis 장애는 성능 저하이지만 **서비스 중단은 아님**

#### 중기 개선 방안
```yaml
# PersistentVolumeClaim으로 Redis 영속성 부여
kind: StatefulSet
spec:
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      storageClassName: gp2
      accessModes: [ReadWriteOnce]
      resources:
        requests:
          storage: 1Gi
```
또는 **ElastiCache Redis** 사용 (관리형, Multi-AZ 지원, 비용 증가)

---

### 4-3. EKS 클러스터

#### 복구 전략
ArgoCD GitOps 구조 덕분에 EKS 재구축 시 **모든 서비스를 자동으로 재배포** 가능

```
EKS 재구축 흐름:
1. terraform apply → EKS 클러스터 + 노드그룹 생성 (~10분)
2. kubectl apply -f cluster-secret-store.yaml
3. kubectl apply -f argocd-repo-external-secret.yaml
4. kubectl apply -f applicationset.yaml
5. ArgoCD가 Git repo에서 모든 서비스 자동 배포 (~5분)
   총 RTO: ~20분
```

#### EKS 상태 백업 불필요 항목
- 모든 K8s 매니페스트: Git repo에 저장 (ArgoCD repo)
- 이미지: ECR에 SHA 태그로 영구 저장
- 시크릿: External Secrets → Parameter Store에서 자동 복원
- DB 데이터: RDS (별도 관리)

#### EKS 노드 Spot 회수 대응
```yaml
# Karpenter NodePool - 복수 인스턴스 타입 + 복수 AZ 지정
spec:
  template:
    spec:
      requirements:
        - key: "topology.kubernetes.io/zone"
          operator: In
          values: ["ap-northeast-2a", "ap-northeast-2c"]  # 2개 AZ 분산
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["spot", "on-demand"]  # on-demand 폴백
        - key: "node.kubernetes.io/instance-type"
          operator: In
          values: ["t3.medium", "t3.large", "t3a.medium", "t3a.large"]
```

---

### 4-4. S3 버킷

#### 현재 상태
| 버킷 | Versioning | Cross-Region | 비고 |
|------|-----------|-------------|------|
| pawfiler-frontend | ❌ | ❌ | CloudFront 캐시로 단기 서비스 가능 |
| pawfiler-admin-frontend | ❌ | ❌ | 어드민만 사용 |
| **pawfiler-quiz-media** | ✅ | ❌ | 90일 이전 버전 보관 |
| **pawfiler-community-media** | ✅ | ❌ | 30일 이전 버전 보관 |
| pawfiler-loki-chunks | ❌ | ❌ | 3일 lifecycle, 로그만 (손실 허용) |
| pawfiler-reports | ❌ | ❌ | 1일 lifecycle (손실 허용) |
| pawfiler-videos | ❌ | ❌ | **사용자 업로드 원본 → Versioning 필요** |

#### 개선 필요 버킷
```hcl
# pawfiler-videos (사용자 업로드 원본) - Versioning 추가
resource "aws_s3_bucket_versioning" "videos" {
  bucket = aws_s3_bucket.videos.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Cross-Region Replication (ap-southeast-1 복제)
resource "aws_s3_bucket_replication_configuration" "quiz_media" {
  bucket = aws_s3_bucket.quiz_media.id
  role   = aws_iam_role.s3_replication.arn

  rule {
    id     = "replicate-to-singapore"
    status = "Enabled"

    destination {
      bucket        = "arn:aws:s3:::pawfiler-quiz-media-backup-ap-southeast-1"
      storage_class = "STANDARD_IA"  # 비용 절감
    }
  }
}
```

#### S3 파일 삭제 복구 절차
```bash
# 실수로 삭제된 파일 복원 (버저닝 활성화된 버킷)
aws s3api list-object-versions \
  --bucket pawfiler-quiz-media \
  --prefix "quiz/videos/deleted-file.mp4"

aws s3api delete-object \
  --bucket pawfiler-quiz-media \
  --key "quiz/videos/deleted-file.mp4" \
  --version-id <delete-marker-version-id>
# → delete marker 제거 = 파일 복원
```

---

### 4-5. NAT Gateway (단일 AZ SPOF)

#### 현재 문제
```hcl
# networking/main.tf - NAT GW가 ap-northeast-2a에만 존재
resource "aws_nat_gateway" "main" {
  subnet_id = aws_subnet.public[0].id  # 항상 ap-northeast-2a
}
```

#### 개선 방안: AZ별 NAT GW
```hcl
# 각 AZ마다 NAT GW 생성 (비용: ~$32 × 2 = $64/월)
resource "aws_eip" "nat_gateway" {
  count  = length(var.public_subnet_cidrs)
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  count         = length(var.public_subnet_cidrs)
  allocation_id = aws_eip.nat_gateway[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
}

# Private Route Table도 AZ별로 분리
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_cidrs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id  # 같은 AZ NAT GW 사용
  }
}
```

> **비용 고려**: 비용 절감 우선이라면 단일 NAT GW 유지 + 장애 시 수동 Route Table 변경 수용

---

### 4-6. Cognito (인증)

Cognito는 AWS 관리형 글로벌 서비스로 리전 단위 장애 가능성이 낮음.
- **단기**: 별도 대응 없음 (AWS SLA 99.9% 신뢰)
- **장기 (Cross-Region 필요 시)**: Cognito User Pool Cross-Region 복제 (AWS 기능 미지원) → 자체 JWT 인증으로 전환 필요 → 구현 복잡도 높음, 현 단계에서는 불필요

---

## 5. 자동화 아키텍처

### 5-1. 전체 DR 자동화 흐름

```
장애 감지:
  CloudWatch Alarm (RDS / EKS / ALB)
       ↓
  EventBridge Rule
       ↓
  Step Functions State Machine 시작
       ↓
  [승인 필요 단계] SNS → Slack/Email 알림
       ↓ (운영자 승인 or 30분 타임아웃 후 자동 진행)
  Lambda 복구 단계별 실행
       ↓
  CloudWatch Logs에 전체 복구 이력 기록
```

### 5-2. Step Functions State Machine 설계

```json
{
  "Comment": "PawFiler DR Automation",
  "StartAt": "DetectFailure",
  "States": {
    "DetectFailure": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:dr-detect",
      "Next": "EvaluateSeverity"
    },
    "EvaluateSeverity": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.severity",
          "StringEquals": "CRITICAL",
          "Next": "NotifyAndWaitApproval"
        },
        {
          "Variable": "$.severity",
          "StringEquals": "HIGH",
          "Next": "AutoRecover"
        }
      ],
      "Default": "LogOnly"
    },
    "NotifyAndWaitApproval": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
      "Parameters": {
        "TopicArn": "arn:aws:sns:ap-northeast-2::pawfiler-dr-alerts",
        "Message": {
          "taskToken.$": "$$.Task.Token",
          "incident.$": "$.incident"
        }
      },
      "HeartbeatSeconds": 1800,
      "Next": "AutoRecover"
    },
    "AutoRecover": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "RDSRecover",
          "States": {
            "RDSRecover": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:::function:dr-rds-recover",
              "End": true
            }
          }
        },
        {
          "StartAt": "S3Verify",
          "States": {
            "S3Verify": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:::function:dr-s3-verify",
              "End": true
            }
          }
        }
      ],
      "Next": "AppRollback"
    },
    "AppRollback": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:dr-app-rollback",
      "Next": "VerifyRecovery"
    },
    "VerifyRecovery": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:dr-verify",
      "Next": "NotifyRecoveryComplete"
    },
    "NotifyRecoveryComplete": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": {
        "TopicArn": "arn:aws:sns:ap-northeast-2::pawfiler-dr-alerts",
        "Message": "DR Recovery completed successfully"
      },
      "End": true
    },
    "LogOnly": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:dr-log",
      "End": true
    }
  }
}
```

### 5-3. Lambda 함수별 역할

#### `dr-detect` - 장애 유형 파악
```python
def handler(event, context):
    alarm_name = event['detail']['alarmName']

    if 'RDS' in alarm_name:
        severity = 'CRITICAL'
        incident_type = 'DATABASE'
    elif 'EKS' in alarm_name or 'ALB' in alarm_name:
        severity = 'HIGH'
        incident_type = 'APPLICATION'
    else:
        severity = 'LOW'
        incident_type = 'UNKNOWN'

    return {
        'severity': severity,
        'incident': {
            'type': incident_type,
            'alarm': alarm_name,
            'timestamp': event['time']
        }
    }
```

#### `dr-rds-recover` - RDS 복구
```python
def handler(event, context):
    rds = boto3.client('rds')

    # 1. Multi-AZ Failover 상태 확인
    response = rds.describe_db_instances(
        DBInstanceIdentifier='pawfiler-db-instance'
    )
    instance = response['DBInstances'][0]

    # Multi-AZ가 활성화되어 있으면 자동 Failover 대기
    if instance['MultiAZ']:
        # CloudWatch 알람이 울린 시점에 이미 Failover 진행 중
        # RDS Proxy가 새 Primary로 자동 연결
        return {'action': 'MULTI_AZ_FAILOVER', 'status': 'AUTO'}

    # Single-AZ인 경우 스냅샷 복원
    snapshots = rds.describe_db_snapshots(
        DBInstanceIdentifier='pawfiler-db-instance',
        SnapshotType='automated'
    )
    latest = sorted(snapshots['DBSnapshots'],
                    key=lambda x: x['SnapshotCreateTime'],
                    reverse=True)[0]

    rds.restore_db_instance_from_db_snapshot(
        DBInstanceIdentifier='pawfiler-db-instance-restored',
        DBSnapshotIdentifier=latest['DBSnapshotIdentifier'],
        DBInstanceClass='db.t3.micro',
        MultiAZ=True  # 복원 시 Multi-AZ 강제 활성화
    )

    # Parameter Store의 DB Host 업데이트 (복원된 인스턴스로 전환)
    ssm = boto3.client('ssm')
    # (복원 완료 후 RDS Proxy target 업데이트 필요)

    return {'action': 'SNAPSHOT_RESTORE', 'snapshot': latest['DBSnapshotIdentifier']}
```

#### `dr-app-rollback` - ArgoCD를 통한 앱 롤백
```python
def handler(event, context):
    # ArgoCD API 호출로 이전 이미지 태그로 롤백
    argocd_token = boto3.client('ssm').get_parameter(
        Name='/pawfiler/argocd/token', WithDecryption=True
    )['Parameter']['Value']

    services = ['auth', 'user', 'quiz', 'community', 'video-analysis', 'admin']

    for service in services:
        requests.post(
            f'https://argocd.pawfiler.site/api/v1/applications/{service}/rollback',
            headers={'Authorization': f'Bearer {argocd_token}'},
            json={'id': 1}  # 이전 히스토리 ID
        )

    return {'action': 'ARGOCD_ROLLBACK', 'services': services}
```

#### `dr-verify` - 헬스체크
```python
def handler(event, context):
    endpoints = [
        'https://api.pawfiler.site/health',
        'https://pawfiler.site',
    ]

    results = {}
    for url in endpoints:
        try:
            r = requests.get(url, timeout=10)
            results[url] = {'status': r.status_code, 'ok': r.status_code < 400}
        except Exception as e:
            results[url] = {'status': 0, 'ok': False, 'error': str(e)}

    all_ok = all(v['ok'] for v in results.values())
    return {'verified': all_ok, 'checks': results}
```

### 5-4. CloudWatch 알람 정의

```hcl
# RDS 연결 실패 알람
resource "aws_cloudwatch_metric_alarm" "rds_connection_failed" {
  alarm_name          = "pawfiler-rds-connection-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "RDS has 0 connections - possible failure"

  dimensions = {
    DBInstanceIdentifier = "pawfiler-db-instance"
  }

  alarm_actions = [aws_sns_topic.dr_alerts.arn]
}

# ALB 5xx 에러율 알람
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "pawfiler-alb-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 50

  alarm_actions = [aws_sns_topic.dr_alerts.arn]
}

# EKS 노드 수 급감 알람
resource "aws_cloudwatch_metric_alarm" "eks_node_count_low" {
  alarm_name          = "pawfiler-eks-nodes-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "cluster_node_count"
  namespace           = "ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1

  alarm_actions = [aws_sns_topic.dr_alerts.arn]
}
```

---

## 6. Route53 Failover 설계

### 6-1. 현재 DNS 구조
```
pawfiler.site      → CloudFront (S3 정적 FE)
api.pawfiler.site  → ALB (EKS Ingress)
```

### 6-2. 목표 DNS 구조 (Failover 적용)

```
                         Route53 Health Check
                               ↓
api.pawfiler.site ─────── Primary Record (ap-northeast-2 ALB)
                    ↘
                      Secondary Record (ap-southeast-1 ALB)  ← Pilot Light
                         (Health Check 실패 시 자동 전환)
```

```hcl
# Route53 Health Check - Primary ALB 모니터링
resource "aws_route53_health_check" "primary_api" {
  fqdn              = "alb.ap-northeast-2.pawfiler.site"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "pawfiler-primary-api-health"
  }
}

# Primary DNS Record (ap-northeast-2)
resource "aws_route53_record" "api_primary" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.pawfiler.site"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier  = "primary"
  health_check_id = aws_route53_health_check.primary_api.id
}

# Secondary DNS Record (ap-southeast-1 Pilot Light)
resource "aws_route53_record" "api_secondary" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.pawfiler.site"
  type    = "A"

  alias {
    name                   = var.secondary_alb_dns  # ap-southeast-1 ALB
    zone_id                = var.secondary_alb_zone_id
    evaluate_target_health = true
  }

  failover_routing_policy {
    type = "SECONDARY"
  }

  set_identifier = "secondary"
}
```

### 6-3. Failover 동작 시나리오
```
정상 상태 (TTL: 60초):
  DNS → Primary ALB (ap-northeast-2)

장애 발생:
  1. Route53 Health Check: /health 엔드포인트 3회 연속 실패 (90초)
  2. Primary Record → Unhealthy 표시
  3. Secondary Record 자동 활성화 (ap-southeast-1 Pilot Light)
  4. DNS TTL 60초 내 전 세계 전파
  → 총 Failover 시간: ~2.5분 (Health Check 90초 + DNS TTL 60초)

복구 후:
  Primary 헬스체크 통과 → Primary Record 자동 재활성화
```

---

## 7. AWS Backup 전략

### 7-1. AWS Backup Plan 설계

```hcl
resource "aws_backup_plan" "pawfiler" {
  name = "pawfiler-backup-plan"

  rule {
    rule_name         = "daily-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 17 * * ? *)"  # 매일 UTC 17:00 (KST 02:00)

    lifecycle {
      cold_storage_after = 30   # 30일 후 Glacier 이동
      delete_after       = 90   # 90일 후 삭제
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.secondary.arn  # ap-southeast-1
      lifecycle {
        delete_after = 30  # Cross-Region 복사본 30일 보관
      }
    }
  }

  rule {
    rule_name         = "weekly-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 17 ? * SUN *)"  # 매주 일요일

    lifecycle {
      delete_after = 365  # 1년 보관
    }
  }
}

# Backup Vault Lock (WORM - 랜섬웨어 대응)
resource "aws_backup_vault_lock_configuration" "main" {
  backup_vault_name   = aws_backup_vault.main.name
  min_retention_days  = 7
  max_retention_days  = 90
  # lock 후에는 AWS Support도 삭제 불가 (Compliance mode)
}

# 백업 대상
resource "aws_backup_selection" "pawfiler" {
  name         = "pawfiler-resources"
  plan_id      = aws_backup_plan.pawfiler.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = [
    aws_db_instance.main.arn,                   # RDS
    aws_s3_bucket.quiz_media.arn,               # S3 Quiz Media
    aws_s3_bucket.community_media.arn,          # S3 Community Media
    aws_s3_bucket.videos.arn,                   # S3 Videos
  ]
}
```

### 7-2. 백업 보관 정책 요약

| 리소스 | 일일 백업 | 주간 백업 | Cross-Region | Vault Lock |
|--------|---------|---------|-------------|-----------|
| RDS | ✅ 90일 | ✅ 365일 | ✅ 30일 | ✅ |
| S3 Videos | ✅ 90일 | ✅ 365일 | ✅ 30일 | ✅ |
| S3 Quiz Media | ✅ 90일 | ✅ | ✅ | ✅ |
| S3 Community | ✅ 90일 | ✅ | ✅ | ✅ |
| EKS | 불필요 (Git에 IaC 저장) | - | - | - |
| Redis | 불필요 (Ephemeral) | - | - | - |

---

## 8. 복구 Runbook

### 8-1. [Tier 1] EKS 파드 장애

**자동 복구 (운영자 개입 불필요)**
```bash
# 확인만 하면 됨
kubectl get pods -n pawfiler --field-selector=status.phase!=Running
kubectl describe pod <crashed-pod> -n pawfiler  # 원인 파악

# Kubernetes가 자동으로 재시작 (restartPolicy: Always)
# Karpenter가 노드 부족 시 자동 프로비저닝
```

**알림**: CloudWatch → AIOps Agent → Slack 자동 통보

---

### 8-2. [Tier 2] RDS 장애 (Multi-AZ 적용 후)

**자동 복구 (60~120초)**
1. AWS가 Primary DB 장애 감지
2. Standby → Primary 자동 승격
3. RDS Proxy가 새 Primary 엔드포인트로 자동 재연결
4. Parameter Store의 `/pawfiler/db/host`는 RDS Proxy 엔드포인트 → 변경 불필요

**운영자 확인 사항**
```bash
# Failover 이벤트 확인
aws rds describe-events \
  --source-identifier pawfiler-db-instance \
  --source-type db-instance \
  --duration 60

# 현재 Primary AZ 확인
aws rds describe-db-instances \
  --db-instance-identifier pawfiler-db-instance \
  --query 'DBInstances[0].{AZ:AvailabilityZone,MultiAZ:MultiAZ,Status:DBInstanceStatus}'
```

---

### 8-3. [Tier 3] RDS 데이터 손상/삭제 (스냅샷 복원)

```bash
# 1. 최근 자동 스냅샷 확인
aws rds describe-db-snapshots \
  --db-instance-identifier pawfiler-db-instance \
  --snapshot-type automated \
  --query 'sort_by(DBSnapshots, &SnapshotCreateTime)[-3:].[DBSnapshotIdentifier,SnapshotCreateTime]'

# 2. 새 인스턴스로 스냅샷 복원
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier pawfiler-db-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t3.micro \
  --no-multi-az

# 3. 복원 완료 대기 (~10분)
aws rds wait db-instance-available \
  --db-instance-identifier pawfiler-db-restored

# 4. RDS Proxy target 업데이트
aws rds register-db-proxy-targets \
  --db-proxy-name pawfiler-rds-proxy \
  --db-instance-identifiers pawfiler-db-restored

# 5. Parameter Store DB Host 업데이트 (RDS Proxy 엔드포인트 유지, 변경 불필요)
# RDS Proxy → 새 인스턴스로 자동 전환

# 6. 앱 재시작 (새 커넥션 강제)
kubectl rollout restart deployment -n pawfiler
```

**예상 RTO**: 15~20분

---

### 8-4. [Tier 3] EKS 클러스터 전체 재구축

```bash
# 1. Terraform으로 인프라 재구축
cd terraform
terraform init
terraform apply -auto-approve
# → EKS, Node Group, NAT GW, ALB Controller, ArgoCD 설치 (~15분)

# 2. kubeconfig 업데이트
aws eks update-kubeconfig --name pawfiler-eks-cluster --region ap-northeast-2

# 3. ArgoCD 부트스트랩 (External Secrets 먼저)
kubectl apply -f pawfiler4-argocd/bootstrap/cluster-secret-store.yaml
kubectl apply -f pawfiler4-argocd/bootstrap/argocd-repo-external-secret.yaml

# 4. ApplicationSet 적용 → 모든 서비스 자동 배포
kubectl apply -f pawfiler4-argocd/bootstrap/applicationset.yaml

# 5. 배포 상태 모니터링
kubectl get applications -n argocd -w

# 6. 서비스 헬스체크
curl -f https://api.pawfiler.site/health
```

**예상 RTO**: 20~25분

---

### 8-5. [Tier 4] 리전 전체 장애 (Cross-Region Failover)

#### 사전 조건 (Pilot Light 구성)
- ap-southeast-1에 최소 인프라 사전 배포:
  - RDS Read Replica (평소에는 읽기 전용)
  - EKS 클러스터 (replicas=0으로 대기)
  - ECR 이미지 복제

```bash
# 1. Route53 Failover 자동 발동 확인 (Health Check 실패 시 자동)
aws route53 get-health-check-status \
  --health-check-id <health-check-id>

# 2. RDS Read Replica → Standalone 승격 (ap-southeast-1)
aws rds promote-read-replica \
  --db-instance-identifier pawfiler-db-replica-ap-southeast-1 \
  --region ap-southeast-1

# 3. EKS replicas 확장 (ap-southeast-1)
kubectl scale deployment --all --replicas=1 -n pawfiler \
  --context=<ap-southeast-1-context>

# 4. Cognito는 글로벌 서비스 - 별도 조치 불필요

# 5. DNS TTL 확인 (자동 전환 확인)
dig api.pawfiler.site
```

**예상 RTO**: 5~10분 (Route53 자동 전환) + 10분 (RDS Promote + EKS 확장)

---

### 8-6. S3 파일 손상/삭제 복구

```bash
# 버저닝된 버킷의 파일 복원
BUCKET="pawfiler-quiz-media"
KEY="quiz/videos/example.mp4"

# 삭제 마커 확인
aws s3api list-object-versions --bucket $BUCKET --prefix $KEY \
  --query 'DeleteMarkers[?IsLatest==`true`].[VersionId,LastModified]'

# 삭제 마커 제거 (파일 복원)
aws s3api delete-object --bucket $BUCKET --key $KEY \
  --version-id <delete-marker-version-id>

# 특정 시점으로 롤백 (이전 버전 복원)
aws s3api copy-object \
  --copy-source $BUCKET/$KEY?versionId=<old-version-id> \
  --bucket $BUCKET \
  --key $KEY
```

---

## 9. DR 드릴 계획

### 9-1. 월간 DR 드릴 스케줄

| 드릴 | 주기 | 방법 | 담당자 |
|------|------|------|--------|
| **EKS 파드 크래시 복구** | 매월 1째 주 화요일 | `kubectl delete pod` 무작위 삭제 후 복구 확인 | 인프라 담당 |
| **RDS Failover 시뮬레이션** | 매월 2째 주 화요일 | `aws rds reboot-db-instance --force-failover` | DB 담당 |
| **S3 파일 복원 드릴** | 매월 3째 주 화요일 | 테스트 파일 삭제 후 버전 복원 | 스토리지 담당 |
| **전체 DR 시뮬레이션** | 분기 1회 | Step Functions 수동 실행 + 복구 시간 측정 | 팀 전체 |

### 9-2. AWS Fault Injection Simulator (FIS) 설정

```hcl
# RDS Failover 실험
resource "aws_fis_experiment_template" "rds_failover" {
  description = "Simulate RDS failover"
  role_arn    = aws_iam_role.fis.arn

  action {
    name      = "rds-failover"
    action_id = "aws:rds:failover-db-cluster"

    target {
      key   = "DBInstances"
      value = "rds-target"
    }
  }

  target {
    name           = "rds-target"
    resource_type  = "aws:rds:db"
    selection_mode = "ALL"

    resource_tag {
      key   = "Name"
      value = "pawfiler-rds-instance"
    }
  }

  stop_condition {
    source = "aws:cloudwatch:alarm"
    value  = aws_cloudwatch_metric_alarm.rds_connection_failed.arn
  }
}

# EKS 노드 종료 실험
resource "aws_fis_experiment_template" "eks_node_failure" {
  description = "Terminate random EKS node"
  role_arn    = aws_iam_role.fis.arn

  action {
    name      = "terminate-node"
    action_id = "aws:ec2:terminate-instances"

    parameter {
      key   = "count"
      value = "1"  # 1개 노드만 종료
    }

    target {
      key   = "Instances"
      value = "eks-nodes"
    }
  }

  target {
    name           = "eks-nodes"
    resource_type  = "aws:ec2:instance"
    selection_mode = "PERCENT(33)"  # 33% 노드만 대상

    resource_tag {
      key   = "eks:cluster-name"
      value = "pawfiler-eks-cluster"
    }
  }
}
```

### 9-3. DR 드릴 평가 기준

| 지표 | 목표 | 측정 방법 |
|------|------|---------|
| 장애 감지 시간 | < 3분 | CloudWatch 알람 발동 시각 |
| 알림 수신 시간 | < 5분 | Slack 메시지 수신 시각 |
| 복구 완료 시간 | < 30분 | 헬스체크 통과 시각 |
| 데이터 무결성 | 100% | 체크섬 검증 |

---

## 10. 구현 우선순위 로드맵

### Phase 1 - 즉시 적용 (이번 주)

| 항목 | 예상 비용 증가 | 구현 난이도 | 효과 |
|------|-------------|-----------|------|
| ✅ RDS `skip_final_snapshot = false` 변경 | $0 | 낮음 | 실수 삭제 시 최종 스냅샷 보존 |
| ✅ RDS `deletion_protection = true` 추가 | $0 | 낮음 | 실수 삭제 방지 |
| ✅ RDS `backup_retention_period = 7` 설정 | ~$2/월 | 낮음 | 7일 자동 백업 |
| ✅ S3 videos 버킷 Versioning 활성화 | ~$1/월 | 낮음 | 사용자 업로드 영상 보호 |

### Phase 2 - 단기 (2주 내)

| 항목 | 예상 비용 증가 | 구현 난이도 |
|------|-------------|-----------|
| RDS Multi-AZ 활성화 | ~$15/월 (인스턴스 2배) | 낮음 (Terraform 1줄) |
| CloudWatch 알람 + SNS 설정 | ~$1/월 | 중간 |
| AWS Backup Plan 생성 | ~$5/월 | 중간 |
| Step Functions DR State Machine | ~$1/월 | 높음 |

### Phase 3 - 중기 (1개월 내)

| 항목 | 예상 비용 증가 | 구현 난이도 |
|------|-------------|-----------|
| Route53 Health Check + Failover | ~$3/월 | 중간 |
| S3 Cross-Region Replication | ~$5/월 | 중간 |
| AWS Backup Vault Lock | $0 | 낮음 |
| FIS DR 드릴 자동화 | ~$1/월 | 높음 |

### Phase 4 - 장기 (필요 시)

| 항목 | 예상 비용 증가 | 구현 난이도 |
|------|-------------|-----------|
| Cross-Region Pilot Light (ap-southeast-1) | ~$80/월 | 매우 높음 |
| RDS Cross-Region Read Replica | ~$15/월 | 중간 |
| AWS Resilience Hub 연동 | ~$5/월 | 중간 |
| Redis ElastiCache 전환 | ~$20/월 | 높음 |

---

## 부록: 현재 인프라 DR 준비도 점수

| 카테고리 | 현재 점수 | 목표 (Phase 2 후) |
|---------|---------|----------------|
| 데이터 보호 (RDS) | 2/10 | 8/10 |
| 데이터 보호 (S3) | 5/10 | 8/10 |
| 가용성 (EKS) | 7/10 | 8/10 |
| 자동화 (복구 자동화) | 2/10 | 7/10 |
| 모니터링 (알람/알림) | 5/10 | 8/10 |
| 복구 검증 (DR 드릴) | 0/10 | 6/10 |
| **전체** | **3.5/10** | **7.5/10** |

> Phase 1+2 완료 시 월 비용 약 $25 증가로 DR 준비도가 3.5 → 7.5로 향상됨
