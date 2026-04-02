package main

import (
	"context"
	"database/sql"
	"encoding/json"
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
	"community/tracing"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	_ "github.com/lib/pq"
	"github.com/lib/pq"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
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
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}
	log.Println("Database connected successfully")
	return nil
}

func main() {
	initCtx := context.Background()
	shutdown, err := tracing.Init(initCtx, "community-service")
	if err != nil {
		log.Printf("[WARN] tracing init failed: %v", err)
	} else {
		defer shutdown()
	}

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
	s := grpc.NewServer(grpc.StatsHandler(otelgrpc.NewServerHandler()))
	pb.RegisterCommunityServiceServer(s, h)
	go func() {
		log.Printf("Community gRPC server listening on :%s", grpcPort)
		if err := s.Serve(lis); err != nil {
			log.Fatalf("failed to serve gRPC: %v", err)
		}
	}()

	// grpc-gateway
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
	}
	if err := pb.RegisterCommunityServiceHandlerFromEndpoint(ctx, mux, "localhost:"+grpcPort, opts); err != nil {
		log.Fatalf("failed to register gateway: %v", err)
	}

	corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if corsOrigins == "" {
		corsOrigins = "https://pawfiler.site"
	}
	allowedOrigins := strings.Split(corsOrigins, ",")

	httpHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Istio가 주입한 trace 헤더(B3/W3C)를 OTel context로 추출 → grpc-gateway → gRPC 전파
		prop := otel.GetTextMapPropagator()
		ctx := prop.Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		r = r.WithContext(ctx)
		// Istio가 주입한 x-user-id 헤더를 gRPC metadata로 전달
		if uid := r.Header.Get("X-User-Id"); uid != "" {
			r.Header.Set("Grpc-Metadata-X-User-Id", uid)
		}
		// ALB health check — must respond 200 before any CORS processing.
		if r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}

		// 내부 전용: AI 분석 결과 태그 자동 추가 (video-analysis 서비스에서 호출)
		if r.URL.Path == "/internal/add-tags" && r.Method == http.MethodPost {
			var req struct {
				PostID string   `json:"post_id"`
				Tags   []string `json:"tags"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PostID == "" {
				http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
				return
			}
			_, err := db.ExecContext(r.Context(), `
				UPDATE community.posts
				SET tags = (
					SELECT array_agg(DISTINCT t)
					FROM unnest(tags || $1::text[]) t
				)
				WHERE id = $2
			`, pq.Array(req.Tags), req.PostID)
			if err != nil {
				log.Printf("[add-tags] failed: %v", err)
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"ok":true}`))
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
