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

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	cognitoidp "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
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

	// auth 스키마 및 users 테이블 자동 생성/마이그레이션
	if _, err := db.Exec(`
		CREATE SCHEMA IF NOT EXISTS auth;
		CREATE TABLE IF NOT EXISTS auth.users (
			id            TEXT PRIMARY KEY,
			email         TEXT UNIQUE NOT NULL,
			password_hash TEXT,
			nickname      VARCHAR(100) NOT NULL DEFAULT '탐정',
			avatar_emoji  VARCHAR(10)  NOT NULL DEFAULT '🦊',
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS nickname          VARCHAR(100) NOT NULL DEFAULT '탐정';
		ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS avatar_emoji      VARCHAR(10)  NOT NULL DEFAULT '🦊';
		ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(20)  NOT NULL DEFAULT 'free';
		ALTER TABLE auth.users ALTER COLUMN password_hash DROP NOT NULL;
	`); err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	// Cognito 설정
	userPoolID := os.Getenv("COGNITO_USER_POOL_ID")
	clientID := os.Getenv("COGNITO_CLIENT_ID")
	if userPoolID == "" || clientID == "" {
		log.Fatal("COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required")
	}

	awsRegion := os.Getenv("AWS_REGION")
	if awsRegion == "" {
		awsRegion = "ap-northeast-2"
	}

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(awsRegion),
	)
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
	}
	cognitoClient := cognitoidp.NewFromConfig(cfg)

	// Redis (rate limiting용 — 실패 시 비활성화)
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr, PoolSize: 10})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Printf("[auth] redis unavailable, rate limiting disabled: %v", err)
		rdb = nil
	}

	h := handler.New(db, cognitoClient, userPoolID, clientID, rdb)

	r := mux.NewRouter()
	r.HandleFunc("/health", h.Health).Methods("GET")
	r.HandleFunc("/auth/signup", h.Signup).Methods("POST")
	r.HandleFunc("/auth/login", h.Login).Methods("POST")
	r.HandleFunc("/auth/refresh", h.Refresh).Methods("POST")
	r.HandleFunc("/auth/logout", h.Logout).Methods("POST")

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
