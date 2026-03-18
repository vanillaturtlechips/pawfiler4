package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	pb "github.com/pawfiler/backend/services/quiz/proto"
	"github.com/pawfiler/backend/services/quiz/internal/handler"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"github.com/pawfiler/backend/services/quiz/internal/service"
	"github.com/pawfiler/backend/services/quiz/internal/userclient"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}

	db, err := gorm.Open(postgres.Open(dbURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(30)
	sqlDB.SetMaxIdleConns(15)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(2 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	redisClient := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		PoolSize:     30,
		MinIdleConns: 10,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		MaxRetries:   3,
	})
	ctx := context.Background()
	if _, err = redisClient.Ping(ctx).Result(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Connected to Redis")

	repo := repository.NewGormQuizRepository(db, redisClient)
	svc := service.NewQuizService(repo, service.NewStatsTracker(repo), service.NewAnswerValidator(), userclient.New())
	quizHandler := handler.NewQuizHandler(svc)

	// gRPC 서버 (내부 서비스 간 통신용)
	grpcPort := os.Getenv("PORT")
	if grpcPort == "" {
		grpcPort = "50052"
	}
	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}
	grpcServer := grpc.NewServer()
	pb.RegisterQuizServiceServer(grpcServer, quizHandler)
	go func() {
		log.Printf("gRPC server on :%s", grpcPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC serve error: %v", err)
		}
	}()

	// grpc-gateway: JSON → gRPC 변환 후 내부 gRPC 서버로 프록시
	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	if err := pb.RegisterQuizServiceHandlerFromEndpoint(ctx, mux, "localhost:"+grpcPort, opts); err != nil {
		log.Fatalf("Failed to register gateway: %v", err)
	}

	// CORS origins from env (default: production domain).
	corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if corsOrigins == "" {
		corsOrigins = "https://pawfiler.site"
	}
	allowedOrigins := strings.Split(corsOrigins, ",")

	// CORS + /health + /api prefix strip 미들웨어
	httpHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ALB health check.
		if r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		origin := r.Header.Get("Origin")
		for _, o := range allowedOrigins {
			if strings.TrimSpace(o) == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		// CloudFront → ALB는 /api/ prefix 유지하므로 제거
		if len(r.URL.Path) >= 5 && r.URL.Path[:5] == "/api/" {
			r.URL.Path = r.URL.Path[4:]
		}
		mux.ServeHTTP(w, r)
	})

	log.Printf("grpc-gateway on :%s → gRPC :%s", httpPort, grpcPort)
	if err := http.ListenAndServe(":"+httpPort, httpHandler); err != nil {
		log.Fatalf("HTTP serve error: %v", err)
	}
}
