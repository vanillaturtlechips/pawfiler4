package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"auth-service/internal/repository"

	"github.com/aws/aws-sdk-go-v2/aws"
	cognitoidp "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	cognitotypes "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/redis/go-redis/v9"
)

// Handler holds dependencies for all auth HTTP handlers.
type Handler struct {
	repo        *repository.UserRepository
	cognito     *cognitoidp.Client
	userPoolID  string
	clientID    string
	redisClient *redis.Client
}

// New creates a Handler wired to the given database, Cognito client, and Redis client.
// redisClient may be nil; rate limiting is disabled when it is.
func New(db *sql.DB, cognito *cognitoidp.Client, userPoolID, clientID string, redisClient *redis.Client) *Handler {
	return &Handler{
		repo:        repository.NewUserRepository(db),
		cognito:     cognito,
		userPoolID:  userPoolID,
		clientID:    clientID,
		redisClient: redisClient,
	}
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type signupReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResp struct {
	Token        string      `json:"token"`
	RefreshToken string      `json:"refresh_token"`
	User         userPayload `json:"user"`
}

type userPayload struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// rateLimitScript uses a Redis Lua script to count login attempts per IP.
// Allows up to 300 attempts per minute per IP address.
var rateLimitScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], 60)
end
return count
`)

// loginRateLimit returns true when the request is within the allowed rate.
// RATE_LIMIT_ENABLED=false 환경변수로 비활성화 가능 (부하 테스트 시 사용)
func (h *Handler) loginRateLimit(r *http.Request) bool {
	if os.Getenv("RATE_LIMIT_ENABLED") == "false" {
		return true
	}
	if h.redisClient == nil {
		return true
	}
	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.TrimSpace(strings.Split(xff, ",")[0])
	} else if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	key := "rate:login:" + strings.TrimSpace(ip)
	count, err := rateLimitScript.Run(context.Background(), h.redisClient, []string{key}).Int()
	if err != nil {
		log.Printf("[auth] rate limit error: %v", err)
		return true
	}
	return count <= 300
}

// Signup handles POST /auth/signup – creates account in Cognito and returns tokens.
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "email and password required")
		return
	}

	// 이미 등록된 이메일 체크
	existing, _ := h.repo.GetUserByEmail(r.Context(), req.Email)
	if existing != nil {
		writeErr(w, http.StatusConflict, "email already registered")
		return
	}

	// Cognito에 사용자 생성 (이메일 인증 건너뜀)
	nickname := strings.SplitN(req.Email, "@", 2)[0]
	createResp, err := h.cognito.AdminCreateUser(r.Context(), &cognitoidp.AdminCreateUserInput{
		UserPoolId:    aws.String(h.userPoolID),
		Username:      aws.String(req.Email),
		MessageAction: cognitotypes.MessageActionTypeSuppress,
		UserAttributes: []cognitotypes.AttributeType{
			{Name: aws.String("email"), Value: aws.String(req.Email)},
			{Name: aws.String("email_verified"), Value: aws.String("true")},
		},
	})
	if err != nil {
		log.Printf("[auth] AdminCreateUser error: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}

	// 영구 비밀번호 설정
	_, err = h.cognito.AdminSetUserPassword(r.Context(), &cognitoidp.AdminSetUserPasswordInput{
		UserPoolId: aws.String(h.userPoolID),
		Username:   aws.String(req.Email),
		Password:   aws.String(req.Password),
		Permanent:  true,
	})
	if err != nil {
		// 롤백: Cognito에서 생성된 사용자 삭제
		h.cognito.AdminDeleteUser(context.Background(), &cognitoidp.AdminDeleteUserInput{
			UserPoolId: aws.String(h.userPoolID),
			Username:   aws.String(req.Email),
		})
		log.Printf("[auth] AdminSetUserPassword error: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Cognito sub (UUID) 추출
	sub := ""
	for _, attr := range createResp.User.Attributes {
		if aws.ToString(attr.Name) == "sub" {
			sub = aws.ToString(attr.Value)
			break
		}
	}
	if sub == "" {
		log.Printf("[auth] could not get cognito sub for %s", req.Email)
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}

	// auth.users에 Cognito sub를 ID로 저장
	if err := h.repo.CreateUserWithCognitoSub(r.Context(), sub, req.Email, nickname); err != nil {
		log.Printf("[auth] CreateUserWithCognitoSub error (non-fatal): %v", err)
	}

	// 로그인하여 토큰 발급
	authResult, err := h.cognito.InitiateAuth(r.Context(), &cognitoidp.InitiateAuthInput{
		AuthFlow: cognitotypes.AuthFlowTypeUserPasswordAuth,
		ClientId: aws.String(h.clientID),
		AuthParameters: map[string]string{
			"USERNAME": req.Email,
			"PASSWORD": req.Password,
		},
	})
	if err != nil {
		log.Printf("[auth] InitiateAuth after signup error: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}

	// user-service 프로필 초기화 (동기) — 응답 전에 닉네임을 확정해야 GetProfile race condition 방지
	h.initUserProfile(sub, nickname)

	writeJSON(w, http.StatusCreated, authResp{
		Token:        aws.ToString(authResult.AuthenticationResult.AccessToken),
		RefreshToken: aws.ToString(authResult.AuthenticationResult.RefreshToken),
		User:         userPayload{ID: sub, Email: req.Email},
	})
}

// Login handles POST /auth/login – validates credentials via Cognito and returns tokens.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.loginRateLimit(r) {
		writeErr(w, http.StatusTooManyRequests, "too many login attempts")
		return
	}
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "email and password required")
		return
	}

	authResult, err := h.cognito.InitiateAuth(r.Context(), &cognitoidp.InitiateAuthInput{
		AuthFlow: cognitotypes.AuthFlowTypeUserPasswordAuth,
		ClientId: aws.String(h.clientID),
		AuthParameters: map[string]string{
			"USERNAME": req.Email,
			"PASSWORD": req.Password,
		},
	})
	if err != nil {
		log.Printf("[auth] Login error for %s: %v", req.Email, err)
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// AccessToken으로 사용자 정보 조회 (sub 추출)
	userInfo, err := h.cognito.GetUser(r.Context(), &cognitoidp.GetUserInput{
		AccessToken: authResult.AuthenticationResult.AccessToken,
	})
	if err != nil {
		log.Printf("[auth] GetUser error: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	sub := ""
	for _, attr := range userInfo.UserAttributes {
		if aws.ToString(attr.Name) == "sub" {
			sub = aws.ToString(attr.Value)
			break
		}
	}

	writeJSON(w, http.StatusOK, authResp{
		Token:        aws.ToString(authResult.AuthenticationResult.AccessToken),
		RefreshToken: aws.ToString(authResult.AuthenticationResult.RefreshToken),
		User:         userPayload{ID: sub, Email: req.Email},
	})
}

// Refresh handles POST /auth/refresh – issues new access token from a valid Cognito refresh token.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		writeErr(w, http.StatusBadRequest, "refresh_token required")
		return
	}

	authResult, err := h.cognito.InitiateAuth(r.Context(), &cognitoidp.InitiateAuthInput{
		AuthFlow: cognitotypes.AuthFlowTypeRefreshTokenAuth,
		ClientId: aws.String(h.clientID),
		AuthParameters: map[string]string{
			"REFRESH_TOKEN": body.RefreshToken,
		},
	})
	if err != nil {
		log.Printf("[auth] Refresh error: %v", err)
		writeErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token":         aws.ToString(authResult.AuthenticationResult.AccessToken),
		"refresh_token": body.RefreshToken, // Cognito는 refresh token을 갱신하지 않음
	})
}

// Logout handles POST /auth/logout – invalidates all Cognito tokens for the user.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	accessToken := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if accessToken != "" {
		if _, err := h.cognito.GlobalSignOut(r.Context(), &cognitoidp.GlobalSignOutInput{
			AccessToken: aws.String(accessToken),
		}); err != nil {
			log.Printf("[auth] GlobalSignOut error (non-fatal): %v", err)
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Health handles GET /health – liveness probe.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// initUserProfile은 user-service에 최초 닉네임을 비동기로 설정한다.
// JSON injection 방지: json.Marshal 사용
func (h *Handler) initUserProfile(userID, nickname string) {
	userSvcURL := os.Getenv("USER_SERVICE_HTTP_URL")
	if userSvcURL == "" {
		userSvcURL = "http://user-service:8083"
	}
	type updateProfileReq struct {
		UserID   string  `json:"user_id"`
		Nickname *string `json:"nickname,omitempty"`
	}
	payloadBytes, err := json.Marshal(updateProfileReq{UserID: userID, Nickname: &nickname})
	if err != nil {
		log.Printf("[auth] initUserProfile marshal error: %v", err)
		return
	}
	// in-cluster 호출이므로 타임아웃 1s × 2회로 충분
	for attempt := 1; attempt <= 2; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		req, _ := http.NewRequestWithContext(ctx, "POST",
			userSvcURL+"/user.UserService/UpdateProfile",
			strings.NewReader(string(payloadBytes)))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		cancel()
		if err == nil && resp.StatusCode < 300 {
			log.Printf("[auth] initialized nickname %q for user %s", nickname, userID)
			return
		}
		log.Printf("[auth] nickname init attempt %d failed for user %s: %v", attempt, userID, err)
	}
	log.Printf("[auth] WARNING: failed to initialize nickname for user %s after 2 attempts", userID)
}

// splitCSV splits a comma-separated string and trims whitespace from each element.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// getEnv returns the value of an environment variable or a default.
func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
