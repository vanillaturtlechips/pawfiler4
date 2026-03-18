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

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// Handler holds dependencies for all auth HTTP handlers.
type Handler struct {
	repo        *repository.UserRepository
	jwtSecret   []byte
	redisClient *redis.Client
}

// New creates a Handler wired to the given database, JWT secret, and Redis client.
// redisClient may be nil; rate limiting is disabled when it is.
func New(db *sql.DB, jwtSecret string, redisClient *redis.Client) *Handler {
	return &Handler{
		repo:        repository.NewUserRepository(db),
		jwtSecret:   []byte(jwtSecret),
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

const accessTTL = 6 * time.Hour
const refreshTTL = 7 * 24 * time.Hour

// makeTokens mints a new access token and refresh token pair for the given user.
func (h *Handler) makeTokens(userID, email string) (access, refresh string, err error) {
	now := time.Now()
	access, err = jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"exp":   now.Add(accessTTL).Unix(),
		"iat":   now.Unix(),
	}).SignedString(h.jwtSecret)
	if err != nil {
		return
	}
	refresh, err = jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  userID,
		"type": "refresh",
		"exp":  now.Add(refreshTTL).Unix(),
		"iat":  now.Unix(),
	}).SignedString(h.jwtSecret)
	return
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
// Allows up to 10 attempts per minute per IP address.
var rateLimitScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], 60)
end
return count
`)

// loginRateLimit returns true when the request is within the allowed rate.
func (h *Handler) loginRateLimit(r *http.Request) bool {
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
	return count <= 10
}

// Signup handles POST /auth/signup – creates a new account and returns tokens.
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "email and password required")
		return
	}
	existing, _ := h.repo.GetUserByEmail(r.Context(), req.Email)
	if existing != nil {
		writeErr(w, http.StatusConflict, "email already registered")
		return
	}
	hash, err := repository.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	id, err := h.repo.CreateUser(r.Context(), req.Email, hash)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	access, refresh, err := h.makeTokens(id, req.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, authResp{
		Token:        access,
		RefreshToken: refresh,
		User:         userPayload{ID: id, Email: req.Email},
	})
}

// Login handles POST /auth/login – validates credentials and returns tokens.
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
	user, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil || user == nil || !repository.CheckPassword(user.PasswordHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	access, refresh, err := h.makeTokens(user.ID, user.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, authResp{
		Token:        access,
		RefreshToken: refresh,
		User:         userPayload{ID: user.ID, Email: user.Email},
	})
}

// Refresh handles POST /auth/refresh – issues new tokens from a valid refresh token.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		writeErr(w, http.StatusBadRequest, "refresh_token required")
		return
	}
	token, err := jwt.Parse(body.RefreshToken, func(t *jwt.Token) (any, error) {
		return h.jwtSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		writeErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["type"] != "refresh" {
		writeErr(w, http.StatusUnauthorized, "invalid token type")
		return
	}
	userID, _ := claims["sub"].(string)
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}
	access, newRefresh, err := h.makeTokens(user.ID, user.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"token":         access,
		"refresh_token": newRefresh,
	})
}

// Logout handles POST /auth/logout – client-side token discard; always succeeds.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Health handles GET /health – liveness probe.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Validate handles GET|POST /auth/validate – verifies an access token and returns claims.
func (h *Handler) Validate(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == "" {
		writeErr(w, http.StatusUnauthorized, "missing token")
		return
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		return h.jwtSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		writeErr(w, http.StatusUnauthorized, "invalid token claims")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"valid":   true,
		"user_id": claims["sub"],
		"email":   claims["email"],
	})
}

// Profile handles GET /auth/profile – returns the authenticated user's info.
func (h *Handler) Profile(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == "" {
		writeErr(w, http.StatusUnauthorized, "missing token")
		return
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		return h.jwtSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		writeErr(w, http.StatusUnauthorized, "invalid token claims")
		return
	}
	userID, _ := claims["sub"].(string)
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, userPayload{ID: user.ID, Email: user.Email})
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
