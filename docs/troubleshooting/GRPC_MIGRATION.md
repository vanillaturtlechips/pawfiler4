# Troubleshooting: REST → gRPC 전환 및 통신 최적화

## 1. Envoy 중앙 프록시 제거 → 서비스별 grpc-gateway 전환

### 문제
- 기존 구조: 프론트 → Envoy(중앙 프록시) → 각 서비스(gRPC)
- Envoy가 `grpc-json-transcoder` + `proto.pb` 파일로 REST↔gRPC 변환 담당
- **문제점**: proto 변경 시마다 `proto.pb` 재생성 후 S3 업로드 → Envoy 재배포 필요
- Envoy 단일 장애점(SPOF): Envoy 파드 장애 시 전체 API 불통
- CORS 설정이 Envoy에 집중되어 서비스별 독립 제어 불가

### 해결
각 서비스(quiz, community, user)에 `grpc-gateway`를 내장하여 자체적으로 REST→gRPC 변환

```
Before: 프론트 → Envoy(grpc-json-transcoder) → gRPC 서비스
After:  프론트 → ALB → 각 서비스(grpc-gateway 내장) → gRPC 핸들러
```

**각 서비스 main.go 구조:**
```go
// gRPC 서버 (내부 서비스 간 통신)
grpcServer := grpc.NewServer()
pb.RegisterQuizServiceServer(grpcServer, handler)
go grpcServer.Serve(grpcListener)

// grpc-gateway (프론트 REST 요청 수신 → gRPC 변환)
mux := runtime.NewServeMux()
pb.RegisterQuizServiceHandlerFromEndpoint(ctx, mux, "localhost:50052", opts)
http.ListenAndServe(":8080", corsMiddleware(mux))
```

### 효과
- Envoy SPOF 제거
- proto 변경 시 해당 서비스만 재배포
- 서비스별 독립적인 CORS/미들웨어 제어

---

## 2. 서비스 간 gRPC 통신 미구현 → 직접 DB 접근 문제

### 문제
- community 서비스가 게시글 작성 시 프론트에서 받은 닉네임/아바타를 그대로 저장
- 사용자가 프로필 변경 후 게시글 작성 시 구 닉네임이 저장되는 데이터 정합성 문제
- quiz 서비스가 `quiz.user_profiles` 테이블을 직접 접근 → user 서비스와 같은 테이블 공유
- 서비스 간 DB 커플링: user 서비스 스키마 변경 시 quiz 서비스도 영향

### 해결

**community → user gRPC 클라이언트 추가**
```go
// internal/userclient/client.go
func (c *Client) GetProfile(ctx context.Context, userID string) (nickname, avatarEmoji string) {
    resp, err := c.svc.GetProfile(ctx, &userpb.GetProfileRequest{UserId: userID})
    // fallback: 기본값 반환
}

// CreatePost에서 user 서비스 gRPC 호출
nickname, avatarEmoji := h.userClient.GetProfile(ctx, req.UserId)
```

**quiz → user gRPC 클라이언트 추가**
```go
// 답변 제출 후 보상(XP/코인) 지급을 user 서비스 gRPC로 위임
func (c *Client) AddRewards(ctx context.Context, userID string, xpDelta, coinDelta int32) error {
    _, err := c.svc.AddRewards(ctx, &userpb.AddRewardsRequest{...})
}
```

### 효과
- 프로필 데이터 정합성 보장 (항상 최신 닉네임/아바타)
- quiz DB 트랜잭션 최소화: stats 업데이트만 트랜잭션, profile 업데이트는 user gRPC 위임
- 서비스 간 DB 커플링 제거

---

## 3. RefillEnergy 엔드포인트 누락

### 문제
```
Access to fetch at 'https://pawfiler.site/api/quiz.QuizService/RefillEnergy'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```
- 기존 REST handler(`internal/rest/handler.go`)에만 구현되어 있던 `RefillEnergy`
- grpc-gateway 전환 후 proto에 RPC 미등록 → 404 → CORS 에러로 오인

### 해결
```protobuf
// quiz.proto에 추가
rpc RefillEnergy(RefillEnergyRequest) returns (RefillEnergyResponse) {
  option (google.api.http) = { post: "/quiz.QuizService/RefillEnergy" body: "*" };
}
```
```go
// quiz_handler.go
func (h *QuizHandler) RefillEnergy(ctx context.Context, req *pb.RefillEnergyRequest) (*pb.RefillEnergyResponse, error) {
    profile, _ := h.service.GetUserProfile(ctx, req.UserId)
    profile.Energy = profile.MaxEnergy
    h.service.UpdateUserProfile(ctx, profile)
    return &pb.RefillEnergyResponse{Success: true, Energy: int32(profile.Energy)}, nil
}
```

---

## 4. 프론트엔드 API 응답 파싱 오류

### 문제 1: 랭킹 `t.slice is not a function`
- `GetRanking` 응답: `{ entries: [...] }` (proto repeated field)
- 프론트 `fetchRanking`이 응답 전체를 배열로 사용 → 객체에 `.slice()` 호출

```js
// Before
return await response.json(); // { entries: [...] }

// After
const data = await response.json();
return Array.isArray(data) ? data : (data.entries ?? []);
```

### 문제 2: 상점 `Cannot read properties of undefined (reading 'map')`
- `GetShopItems` 응답: `{ items: [...] }` (단일 배열)
- 프론트 `ShopCatalog` 타입: `{ subscriptions, coin_packages, packages }` (분류된 구조)

```js
// Before
return userServicePost("GetShopItems", {}); // { items: [...] } 그대로 반환

// After
const res = await userServicePost("GetShopItems", {});
return {
  subscriptions: items.filter(i => i.type === "subscription"),
  coin_packages: items.filter(i => i.type === "coin_package"),
  packages: items.filter(i => i.type !== "subscription" && i.type !== "coin_package"),
};
```

---

## 5. community.post_votes 테이블 미생성

### 문제
```
pq: relation "community.post_votes" does not exist
```
- `GetPost` 쿼리에서 `post_votes` 서브쿼리 사용
- DB 마이그레이션 스크립트에 해당 테이블 누락

### 해결
```sql
CREATE TABLE IF NOT EXISTS community.post_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  vote BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
```

---

## 6. CloudFront → ALB 라우팅 누락 (user 서비스)

### 문제
- user 서비스 grpc-gateway 전환 후 ingress에 `/api/user.UserService` 경로 추가
- 실제 요청 시 `content-type: text/html` 반환 (프론트 HTML이 응답됨)

### 원인
- CloudFront `/api/*` behavior: POST 허용, 헤더 전체 포워딩 확인 → 정상
- ALB ingress에 user 라우팅 존재 확인 → 정상
- **실제 원인**: ALB healthcheck path `/health`에 user 서비스가 응답 못 해 unhealthy 상태

### 해결
user 서비스 main.go에 `/health` 엔드포인트 추가 (grpc-gateway mux 외부에서 처리)

---

## 8. quiz → user gRPC AddRewards 도입 시 데이터 손상

### 문제
quiz 서비스가 `quiz.user_profiles`를 직접 업데이트하면서 동시에 user gRPC `AddRewards`도 호출 → 같은 테이블을 두 서비스가 동시에 쓰면서 XP/코인이 0으로 초기화되는 현상 발생

### 원인 분석
```
SubmitAnswer 호출 시:
1. quiz: ApplyAnswerRewards 트랜잭션 (stats + user_profiles 업데이트)
2. quiz: user gRPC AddRewards 호출 → user 서비스도 user_profiles 업데이트
→ 두 서비스가 같은 행을 동시에 덮어씀 → 레이스 컨디션으로 데이터 손상
```

### 해결 (역할 분리)
- `quiz.user_stats` → quiz 서비스가 단독 소유 (트랜잭션 직접 처리)
- `quiz.user_profiles` XP/코인 → user 서비스 gRPC `AddRewards`로 위임
- `ApplyAnswerRewards`에서 profile 업데이트 코드 완전 제거

```go
// quiz_service.go - stats만 트랜잭션, XP/코인은 gRPC 비동기 위임
updatedStats, _, err := s.repo.ApplyAnswerRewards(ctx, userID, isCorrect, 0, 0)

go func() {
    gCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()
    s.userClient.AddRewards(gCtx, userID, xpEarned, coinsEarned)
}()
```

---

## 9. quiz → user gRPC 첫 연결 DeadlineExceeded

### 문제
```
[userclient] AddRewards failed: rpc error: code = DeadlineExceeded
desc = received context error while waiting for new LB policy update: context deadline exceeded
```
- 첫 번째 gRPC 호출 시 LB policy 초기화에 시간이 걸려 2초 타임아웃 초과
- 이후 요청은 커넥션 재사용으로 정상

### 해결
```go
// userclient/client.go
func New() *Client {
    c := &Client{}
    _ = c.ensureConnected() // 앱 시작 시 미리 연결
    return c
}
```
타임아웃도 2초 → 5초로 조정

---

## 10. quiz SubmitAnswer 응답에 totalExp/totalCoins 미반영

### 문제
- XP/코인 지급을 user gRPC 비동기로 위임 후, 응답의 `totalExp`/`totalCoins`는 quiz DB에서 읽어옴
- quiz DB `user_profiles`는 더 이상 XP/코인 업데이트 안 하므로 응답값이 항상 이전 값

### 해결
응답 생성 시 quiz DB 현재값 + 이번 획득분을 직접 합산

```go
// quiz_handler.go
if profile, err := h.service.GetUserProfile(ctx, req.UserId); err == nil {
    response.TotalExp   = profile.TotalExp + result.XPEarned + result.StreakBonus
    response.TotalCoins = profile.TotalCoins + result.CoinsEarned
    // 실제 DB 반영은 user gRPC가 비동기 처리
}
```

### 문제
```
Access to fetch at 'http://localhost:8082/admin/shop/items' blocked by CORS
```
- `.env.production`에 `VITE_ADMIN_API_URL` 미설정
- 빌드 시 fallback `localhost:8082` 사용

### 해결
```env
# admin-frontend/.env.production
VITE_ADMIN_API_URL=http://k8s-admin-adminser-xxxx.elb.ap-northeast-2.amazonaws.com
```
