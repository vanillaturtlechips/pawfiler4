package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"auth-service/internal/handler"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/rs/cors"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		log.Fatalf("failed to ping db: %v", err)
	}

	// Ensure auth schema and users table exist at startup.
	// CREATE TABLE IF NOT EXISTS는 테이블이 없을 때만 생성하므로
	// 기존 테이블에 컬럼이 없는 경우를 위해 ADD COLUMN IF NOT EXISTS도 함께 실행
	if _, err := db.Exec(`
		CREATE SCHEMA IF NOT EXISTS auth;
		CREATE TABLE IF NOT EXISTS auth.users (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email         TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			nickname      VARCHAR(100) NOT NULL DEFAULT '탐정',
			avatar_emoji  VARCHAR(10)  NOT NULL DEFAULT '🦊',
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS nickname     VARCHAR(100) NOT NULL DEFAULT '탐정';
		ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS avatar_emoji VARCHAR(10)  NOT NULL DEFAULT '🦊';
	`); err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr, PoolSize: 10})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Printf("[auth] redis unavailable, rate limiting disabled: %v", err)
		rdb = nil
	}

	h := handler.New(db, jwtSecret, rdb)

	r := mux.NewRouter()
	r.HandleFunc("/health", h.Health).Methods("GET")
	r.HandleFunc("/auth/signup", h.Signup).Methods("POST")
	r.HandleFunc("/auth/login", h.Login).Methods("POST")
	r.HandleFunc("/auth/refresh", h.Refresh).Methods("POST")
	r.HandleFunc("/auth/logout", h.Logout).Methods("POST")
	r.HandleFunc("/auth/validate", h.Validate).Methods("GET", "POST")
	r.HandleFunc("/auth/profile", h.Profile).Methods("GET")

	// Read allowed origins from env; default to production domain.
	allowedOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "https://pawfiler.site"
	}
	c := cors.New(cors.Options{
		AllowedOrigins:   strings.Split(allowedOrigins, ","),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	// Strip /api prefix before route matching so both /auth/login and
	// /api/auth/login work. Must wrap the mux, not use r.Use(), because
	// gorilla/mux middleware runs after route selection.
	prefixStrip := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") {
			req.URL.Path = req.URL.Path[4:]
		}
		r.ServeHTTP(w, req)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}
	log.Printf("Auth service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, c.Handler(prefixStrip)); err != nil {
		log.Fatal(err)
	}
}
