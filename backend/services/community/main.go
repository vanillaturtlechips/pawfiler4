package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"community/internal/handler"
	"community/pb"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var db *sql.DB

func initDB() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL environment variable is required")
	}
	var err error
	db, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	db.SetMaxOpenConns(150)
	db.SetMaxIdleConns(50)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}
	// Add missing columns if not exist
	migrations := []string{
		`ALTER TABLE community.posts ADD COLUMN IF NOT EXISTS media_url TEXT`,
		`ALTER TABLE community.posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(10)`,
		`ALTER TABLE community.posts ADD COLUMN IF NOT EXISTS is_admin_post BOOLEAN DEFAULT FALSE`,
		`ALTER TABLE community.posts ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT NULL`,
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			log.Printf("migration warning: %v", err)
		}
	}
	log.Println("Database connected successfully")
	return nil
}

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	grpcPort := os.Getenv("PORT")
	if grpcPort == "" {
		grpcPort = "50053"
	}
	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	h := handler.NewHandler(db)

	// gRPC 서버
	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	pb.RegisterCommunityServiceServer(s, h)
	go func() {
		log.Printf("Community gRPC server listening on :%s", grpcPort)
		if err := s.Serve(lis); err != nil {
			log.Fatalf("failed to serve gRPC: %v", err)
		}
	}()

	// grpc-gateway
	ctx := context.Background()
	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	if err := pb.RegisterCommunityServiceHandlerFromEndpoint(ctx, mux, "localhost:"+grpcPort, opts); err != nil {
		log.Fatalf("failed to register gateway: %v", err)
	}

	corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if corsOrigins == "" {
		corsOrigins = "https://pawfiler.site"
	}
	allowedOrigins := strings.Split(corsOrigins, ",")

	httpHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ALB health check — must respond 200 before any CORS processing.
		if r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		origin := r.Header.Get("Origin")
		allowed := false
		for _, o := range allowedOrigins {
			if strings.TrimSpace(o) == origin {
				allowed = true
				break
			}
		}
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		if len(r.URL.Path) >= 5 && r.URL.Path[:5] == "/api/" {
			r.URL.Path = r.URL.Path[4:]
		}
		mux.ServeHTTP(w, r)
	})

	log.Printf("Community grpc-gateway on :%s", httpPort)
	if err := http.ListenAndServe(":"+httpPort, httpHandler); err != nil {
		log.Fatalf("HTTP serve error: %v", err)
	}
}
