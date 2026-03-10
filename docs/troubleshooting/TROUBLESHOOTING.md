# PawFiler 트러블슈팅 가이드

마지막 업데이트: 2026-03-10

## 목차
- [Backend 이슈](#backend-이슈)
- [인프라 이슈](#인프라-이슈)
- [배포 이슈](#배포-이슈)

---

## Backend 이슈

### Region Select 좌표 타입 에러

**증상:**
```
selected_region.y: invalid value 167.39999389648438 for type TYPE_INT32
```

**원인:**
- `backend/proto/quiz.proto`에서 Point와 Region 타입이 int32로 정의됨
- 브라우저에서 전송하는 float 좌표를 처리할 수 없음

**해결 방법:**

1. proto 파일 수정:
```protobuf
// backend/proto/quiz.proto
message Point {
  float x = 1;  // int32 → float
  float y = 2;  // int32 → float
}

message Region {
  float x = 1;      // int32 → float
  float y = 2;      // int32 → float
  float radius = 3; // int32 → float
}
```

2. Quiz Service 핸들러 수정:
```go
// backend/services/quiz/internal/handler/quiz_handler.go
// convertProtoToAnswer 함수에서 우선순위 조정
// SelectedRegion을 먼저 체크하도록 변경
```

3. proto.pb 재생성:
```bash
cd backend
docker-compose up proto-generator
```

4. 로컬 테스트:
```bash
docker-compose up --build quiz-service
```

5. EKS 배포:
```bash
# Quiz Service 이미지 빌드 & 푸시
cd backend/services/quiz
docker build -t 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com/pawfiler/quiz-service:latest .
docker push 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com/pawfiler/quiz-service:latest

# Quiz Service 재시작
kubectl rollout restart deployment quiz-service -n pawfiler

# proto.pb ConfigMap 업데이트
kubectl apply -f k8s/proto-configmap.yaml
kubectl rollout restart deployment envoy-proxy -n pawfiler
```

**관련 커밋:**
- `fix: Region Select 좌표 타입을 int32에서 float로 변경`
- `fix: EKS proto.pb를 float 타입으로 업데이트 (Region Select 좌표 수정)`

---

## 인프라 이슈

### Pod CrashLoopBackOff

**증상:**
```bash
kubectl get pods -n pawfiler
# NAME                                 READY   STATUS             RESTARTS
# quiz-service-xxx                     0/1     CrashLoopBackOff   5
```

**원인:**
- DB 연결 실패
- 환경변수 누락
- 이미지 빌드 오류

**해결 방법:**

1. 로그 확인:
```bash
kubectl logs -n pawfiler <pod-name>
kubectl describe pod -n pawfiler <pod-name>
```

2. DB Secret 확인:
```bash
kubectl get secret -n pawfiler db-credentials -o yaml
```

3. 환경변수 확인:
```bash
kubectl exec -n pawfiler deployment/quiz-service -- env
```

---

### DB 연결 실패

**증상:**
```
Error: dial tcp: lookup pawfiler-db.xxx.rds.amazonaws.com: no such host
```

**원인:**
- RDS 엔드포인트 오류
- 보안그룹 설정 문제
- Secret 설정 오류

**해결 방법:**

1. RDS 엔드포인트 확인:
```bash
aws rds describe-db-instances --db-instance-identifier pawfiler-db --query 'DBInstances[0].Endpoint.Address'
```

2. Secret 업데이트:
```bash
kubectl create secret generic db-credentials \
  --from-literal=host=<RDS_ENDPOINT> \
  --from-literal=port=5432 \
  --from-literal=database=pawfiler \
  --from-literal=username=pawfiler \
  --from-literal=password=<PASSWORD> \
  --from-literal=sslmode=disable \
  -n pawfiler \
  --dry-run=client -o yaml | kubectl apply -f -
```

3. 보안그룹 확인:
- RDS 보안그룹에서 EKS 노드 보안그룹 허용 확인

---

### IRSA 권한 오류

**증상:**
```
AccessDenied: User: arn:aws:sts::xxx:assumed-role/xxx is not authorized to perform: s3:PutObject
```

**원인:**
- ServiceAccount에 IAM Role이 제대로 연결되지 않음
- IAM Policy 권한 부족

**해결 방법:**

1. ServiceAccount 확인:
```bash
kubectl get sa -n admin admin-service -o yaml
# annotations에 eks.amazonaws.com/role-arn 확인
```

2. Pod에서 IAM Role 확인:
```bash
kubectl exec -n admin deployment/admin-service -- env | grep AWS
```

3. IAM Role Trust Policy 확인:
```bash
aws iam get-role --role-name pawfiler-admin-service-role
```

---

## 배포 이슈

### ALB Ingress 생성 안 됨

**증상:**
```bash
kubectl get ingress -n pawfiler
# ADDRESS 필드가 비어있음
```

**원인:**
- AWS Load Balancer Controller 미설치
- Ingress annotation 오류
- Subnet 태그 누락

**해결 방법:**

1. ALB Controller 로그 확인:
```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

2. Ingress 상태 확인:
```bash
kubectl describe ingress -n pawfiler envoy-ingress
```

3. Subnet 태그 확인:
- Public Subnet: `kubernetes.io/role/elb = 1`
- Private Subnet: `kubernetes.io/role/internal-elb = 1`

---

### ECR 로그인 실패

**증상:**
```
Error response from daemon: login attempt failed with status: 400 Bad Request
```

**원인:**
- PowerShell에서 파이프 처리 문제

**해결 방법:**

PowerShell에서:
```powershell
$password = aws ecr get-login-password --region ap-northeast-2
echo $password | docker login --username AWS --password-stdin 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com
```

또는 Bash에서:
```bash
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com
```

---

### CloudFront 403 Forbidden

**증상:**
- 일부 이미지는 접근 가능, 일부는 403 에러

**원인:**
- S3 버킷이 공개/비공개 혼재
- CloudFront OAI 설정 문제

**해결 방법:**

1. S3를 완전히 비공개로 설정
2. CloudFront를 통해서만 접근하도록 통일
3. DB의 URL을 CloudFront 도메인으로 변경:

```sql
-- backend/scripts/init-db.sql
UPDATE questions 
SET media_url = REPLACE(media_url, 
  'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com',
  'https://dx0x4vrja13f5.cloudfront.net'
);

UPDATE questions 
SET comparison_media_url = REPLACE(comparison_media_url, 
  'https://pawfiler-quiz-media.s3.ap-northeast-2.amazonaws.com',
  'https://dx0x4vrja13f5.cloudfront.net'
)
WHERE comparison_media_url IS NOT NULL;
```

---

## 참고 문서

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 시스템 아키텍처
- [terraform/README.md](../terraform/README.md) - Terraform 가이드
