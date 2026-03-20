# Admin 프론트엔드 CORS + NLB URL 문제

## 증상

```
Access to fetch at 'http://k8s-pawfiler-pawfiler-xxx.elb.amazonaws.com/admin/shop/items'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
GET .../admin/shop/items net::ERR_FAILED 301 (Moved Permanently)
```

## 원인 분석

### 1. 잘못된 API URL
`admin-frontend/.env.production`에 pawfiler 서비스용 ALB URL이 설정되어 있었음.

```
# 잘못된 설정
VITE_ADMIN_API_URL=http://k8s-pawfiler-pawfiler-b9f4322b80-282233233.ap-northeast-2.elb.amazonaws.com
```

admin-service는 `admin` 네임스페이스에 별도 NLB(type: LoadBalancer)로 배포되어 있어 다른 엔드포인트를 사용.

### 2. SSL 리다이렉트
pawfiler ALB는 `alb.ingress.kubernetes.io/ssl-redirect: '443'` 설정으로 HTTP → HTTPS 301 리다이렉트.
브라우저는 301 응답에 CORS 헤더가 없으면 요청을 차단.

### 3. admin-service 네임스페이스
admin-service는 `pawfiler` ns가 아닌 `admin` ns에 배포되어 pawfiler ALB 인그레스와 무관.

## 해결 방법

```bash
# admin-service NLB URL 확인
kubectl get svc admin-service -n admin -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
# → k8s-admin-adminser-191910d160-6c8e0918eb4fc0c3.elb.ap-northeast-2.amazonaws.com
```

`admin-frontend/.env.production` 수정:
```
VITE_ADMIN_API_URL=http://k8s-admin-adminser-191910d160-6c8e0918eb4fc0c3.elb.ap-northeast-2.amazonaws.com
```

재빌드 + S3 재배포:
```bash
cd admin-frontend && npm run build
aws s3 sync dist/ s3://pawfiler-admin-frontend --delete
```

## admin-service CORS 설정

`backend/services/admin/main.go`에서 `CORS_ALLOWED_ORIGINS` 환경변수로 허용 오리진 관리.
`apps/services/admin/deployment.yaml`에 설정:

```yaml
- name: CORS_ALLOWED_ORIGINS
  value: "http://pawfiler-admin-frontend.s3-website.ap-northeast-2.amazonaws.com,https://pawfiler.site"
```
