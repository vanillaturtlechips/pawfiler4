package main

import (
	"context"
	"log"
	"net"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	pb "github.com/pawfiler/backend/services/quiz/proto"
	"github.com/pawfiler/backend/services/quiz/internal/handler"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"github.com/pawfiler/backend/services/quiz/internal/service"
)

func main() {
	// 환경 변수 확인
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379" // Kubernetes 서비스명
	}

	// GORM 데이터베이스 연결
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	db, err := gorm.Open(postgres.Open(dbURL), gormConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database with GORM: %v", err)
	}

	// 커넥션 풀 설정
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get underlying sql.DB: %v", err)
	}

	// Connection pool settings
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(50)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(2 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Successfully connected to PostgreSQL with GORM")

	// Redis 클라이언트 연결 (고부하 대응 최적화)
	redisClient := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		Password:     "", // 패스워드 없음
		DB:           0,  // 기본 DB
		PoolSize:     100, // 커넥션 풀 크기 (20 → 100, 1000명 동시 사용자 대응)
		MinIdleConns: 20,  // 최소 유지 커넥션 (5 → 20)
		DialTimeout:  5 * time.Second,  // 연결 타임아웃
		ReadTimeout:  3 * time.Second,  // 읽기 타임아웃
		WriteTimeout: 3 * time.Second,  // 쓰기 타임아웃
		MaxRetries:   3,                // 재시도 횟수
	})

	// Redis 연결 테스트
	ctx := context.Background()
	_, err = redisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Successfully connected to Redis")

	// Repository 생성 (GORM + Redis)
	repo := repository.NewGormQuizRepository(db, redisClient)
	
	// 기존 서비스 레이어는 그대로 사용
	statsTracker := service.NewStatsTracker(repo)
	validator := service.NewAnswerValidator()
	svc := service.NewQuizService(repo, statsTracker, validator)
	quizHandler := handler.NewQuizHandler(svc)

	// gRPC 서버 시작
	port := os.Getenv("PORT")
	if port == "" {
		port = "50052"
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterQuizServiceServer(grpcServer, quizHandler)

	log.Printf("Quiz Service started on :%s with GORM + Redis", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
