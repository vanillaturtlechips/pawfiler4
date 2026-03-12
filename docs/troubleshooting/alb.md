# NLB → ALB 마이그레이션 트러블슈팅

## 문제: Gateway API가 작동하지 않음

### 시도한 방법
1. Gateway API CRDs 설치
2. GatewayClass `aws-alb` 생성
3. Gateway + HTTPRoute 배포

### 문제점
- AWS Load Balancer Controller v2.8.0이 Gateway API를 **실험적 기능**으로만 지원
- Gateway 상태가 계속 `Unknown`으로 유지
- 컨트롤러가 Gateway 리소스를 처리하지 않음

### 해결: Ingress 사용
Gateway API 대신 안정적인 Ingress 사용으로 변경

## 문제: WAF 권한 오류

### 에러 메시지
```
AccessDeniedException: User is not authorized to perform: 
- wafv2:GetWebACLForResource
- waf-regional:GetWebACLForResource
- shield:GetSubscriptionState
```

### 원인
ALB Controller IAM Role에 WAF/Shield 권한 누락

### 해결
`terraform/helm-iam.tf`에 WAF 정책 추가:
```hcl
resource "aws_iam_role_policy" "alb_controller_waf" {
  name = "${var.project_name}-alb-controller-waf"
  role = aws_iam_role.alb_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "wafv2:GetWebACL",
        "wafv2:GetWebACLForResource",
        "wafv2:AssociateWebACL",
        "wafv2:DisassociateWebACL",
        "waf-regional:GetWebACLForResource",
        "shield:GetSubscriptionState"
      ]
      Resource = "*"
    }]
  })
}
```

**Terraform state lock 문제 시 AWS CLI로 직접 적용:**
```bash
cat > /tmp/waf-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "wafv2:GetWebACL",
      "wafv2:GetWebACLForResource",
      "wafv2:AssociateWebACL",
      "wafv2:DisassociateWebACL",
      "waf-regional:GetWebACLForResource",
      "shield:GetSubscriptionState"
    ],
    "Resource": "*"
  }]
}
EOF
aws iam put-role-policy --role-name pawfiler-alb-controller \
  --policy-name pawfiler-alb-controller-waf \
  --policy-document file:///tmp/waf-policy.json
```

적용 후 Pod 재시작 필수:
```bash
kubectl delete pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

## CloudFront Origin 업데이트

### 수동 업데이트 (Terraform state lock 문제 시)

1. ALB 도메인 확인:
```bash
kubectl get ingress -n pawfiler envoy-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

2. AWS Console에서 업데이트:
   - CloudFront → Distribution `E1YU8EA9X822Q1`
   - Origins 탭 → API origin 편집
   - Origin domain을 ALB 도메인으로 변경
   - 배포 대기 (5-10분)

3. 또는 `terraform.tfvars` 수동 업데이트 후:
```bash
cd terraform
# terraform.tfvars에 envoy_alb_domain 추가
terraform apply -target=aws_cloudfront_distribution.frontend
```

## 최종 아키텍처

```
CloudFront → ALB (Ingress) → Envoy (ClusterIP) → gRPC Services
```

### 변경 사항
- ~~NLB (LoadBalancer Service)~~ → **ALB (Ingress)**
- ~~Gateway API~~ → **Ingress**
- Envoy Service: LoadBalancer → ClusterIP

## 향후 계획

**Istio 마이그레이션 예정**
- 현재 구성은 1차 배포용 임시 솔루션
- Istio로 전환 시 Gateway API 사용 가능
- Service Mesh 기능 활용 (mTLS, Traffic Management, Observability)
