# Troubleshooting: S3 Frontend와 ALB Backend 주소 노출 문제

## 문제 상황

S3에 호스팅된 프론트엔드에서 백엔드 API를 호출할 때 ALB 주소가 브라우저에 노출되는 문제가 발생했습니다.

```javascript
// 문제 코드
const API_URL = "http://k8s-pawfiler-envoyingr-abc123.ap-northeast-2.elb.amazonaws.com";
```

**보안 문제:**
- ❌ ALB 주소가 클라이언트에 노출
- ❌ 직접 ALB 접근 가능
- ❌ CORS 설정 복잡
- ❌ SSL 인증서 관리 어려움

## 원인 분석

### 아키텍처 문제

```
사용자 → CloudFront (S3) → ❌ 직접 ALB 호출
                              (주소 노출)
```

**문제점:**
1. 프론트엔드와 백엔드가 다른 도메인
2. CloudFront가 정적 파일만 서빙
3. API 요청이 ALB로 직접 전달

## 해결 방법

### 1. CloudFront Origin 추가

**변경 전:**
```hcl
# CloudFront가 S3만 바라봄
origin {
  domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
  origin_id   = "S3-frontend"
}
```

**변경 후:**
```hcl
# S3 Origin (정적 파일)
origin {
  domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
  origin_id   = "S3-frontend"
}

# ALB Origin (API)
origin {
  domain_name = data.aws_lb.envoy.dns_name
  origin_id   = "ALB-backend"
  
  custom_origin_config {
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"
    origin_ssl_protocols   = ["TLSv1.2"]
  }
}
```

### 2. Behavior 설정

```hcl
# 기본: S3에서 정적 파일 서빙
default_cache_behavior {
  target_origin_id = "S3-frontend"
  # ...
}

# /api/* 경로: ALB로 프록시
ordered_cache_behavior {
  path_pattern     = "/api/*"
  target_origin_id = "ALB-backend"
  
  allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
  cached_methods  = ["GET", "HEAD"]
  
  forwarding_values {
    query_string = true
    headers      = ["Authorization", "Content-Type"]
    cookies {
      forward = "all"
    }
  }
  
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 0
}
```

### 3. 프론트엔드 코드 수정

**변경 전:**
```javascript
// ALB 주소 직접 노출
const API_URL = "http://k8s-pawfiler-envoyingr-abc123.ap-northeast-2.elb.amazonaws.com";

fetch(`${API_URL}/quiz/list`);
```

**변경 후:**
```javascript
// 상대 경로 사용 (CloudFront를 통해 자동 라우팅)
const API_URL = "/api";

fetch(`${API_URL}/quiz/list`);
// → https://pawfiler.com/api/quiz/list
// → CloudFront가 ALB로 프록시
```

### 4. Envoy 경로 재작성

```yaml
# backend/envoy/envoy.yaml
routes:
  - match:
      prefix: "/api"
    route:
      prefix_rewrite: "/"
      cluster: grpc_services
```

**요청 흐름:**
```
브라우저: GET /api/quiz/list
  ↓
CloudFront: /api/quiz/list → ALB
  ↓
Envoy: /api/quiz/list → /quiz/list (prefix_rewrite)
  ↓
gRPC Service: /quiz/list
```

## 최종 아키텍처

```
사용자
  ↓
CloudFront (pawfiler.com)
  ├─ / → S3 (정적 파일)
  └─ /api/* → ALB → Envoy → gRPC Services
```

**장점:**
- ✅ ALB 주소 완전히 숨김
- ✅ 단일 도메인 (CORS 불필요)
- ✅ CloudFront SSL 인증서 사용
- ✅ CloudFront 캐싱 활용
- ✅ DDoS 보호 (CloudFront Shield)

## Terraform 구현

```hcl
# terraform/modules/s3/main.tf
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-frontend"
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }
  
  origin {
    domain_name = var.alb_dns_name
    origin_id   = "ALB-backend"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  default_cache_behavior {
    target_origin_id       = "S3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    
    forwarding_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }
  
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "ALB-backend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    
    forwarding_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Accept"]
      cookies {
        forward = "all"
      }
    }
    
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }
}
```

## 검증

### 1. CloudFront 동작 확인

```bash
# 정적 파일 (S3)
curl -I https://pawfiler.com/
# X-Cache: Hit from cloudfront

# API 요청 (ALB)
curl -I https://pawfiler.com/api/quiz/list
# X-Cache: Miss from cloudfront (캐싱 안 함)
```

### 2. ALB 직접 접근 차단 확인

```bash
# ALB 직접 접근 (실패해야 함)
curl http://k8s-pawfiler-envoyingr-abc123.ap-northeast-2.elb.amazonaws.com
# 타임아웃 또는 403
```

### 3. 브라우저 개발자 도구

```
Network 탭:
  Request URL: https://pawfiler.com/api/quiz/list
  ✅ ALB 주소 노출 안 됨
```

## 교훈

1. **단일 도메인**: 프론트엔드와 백엔드를 같은 도메인으로 통합
2. **CloudFront 활용**: 정적 파일 + API 프록시 모두 처리
3. **보안 강화**: 내부 인프라 주소 완전히 숨김
4. **성능 향상**: CloudFront 엣지 로케이션 활용

## 참고

- [CloudFront Multiple Origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
- 관련 파일: `terraform/modules/s3/main.tf`
