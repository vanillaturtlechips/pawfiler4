package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"quiz-service/internal/handler"
	"quiz-service/internal/repository"
	"quiz-service/internal/service"
	"quiz-service/pkg/kafka"
	pb "quiz-service/proto"
)

// Config holds the application configuration loaded from environment variables
// Requirement 14.5: Load configuration from environment variables
type Config struct {
	// Database configuration
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	// Kafka configuration
	KafkaBrokers string

	// Server configuration
	GRPCPort string
}

// loadConfig loads configuration from environment variables
// Requirement 14.5: Read database connection info and Kafka broker address from environment
func loadConfig() *Config {
	return &Config{
		DBHost:       getEnv("DB_HOST", "localhost"),
		DBPort:       getEnv("DB_PORT", "5432"),
		DBUser:       getEnv("DB_USER", "postgres"),
		DBPassword:   getEnv("DB_PASSWORD", "postgres"),
		DBName:       getEnv("DB_NAME", "pawfiler"),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "localhost:9092"),
		GRPCPort:     getEnv("GRPC_PORT", "50052"),
	}
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	// Load configuration from environment variables
	// Requirement 14.5: Environment variable loading
	config := loadConfig()

	log.Println("Starting Quiz Service...")
	log.Printf("Configuration: DB=%s:%s, Kafka=%s, Port=%s",
		config.DBHost, config.DBPort, config.KafkaBrokers, config.GRPCPort)

	// Initialize PostgreSQL database connection
	// Requirement 14.1: Connect to PostgreSQL database
	db, err := initDatabase(config)
	if err != nil {
		// Requirement 14.4: Log error and exit if database connection fails
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	log.Println("Database connection established")

	// Perform health check - wait for database to be ready
	// Requirement 17.5: Health check for database connection
	if err := waitForDatabase(db, 30*time.Second); err != nil {
		log.Fatalf("Database health check failed: %v", err)
	}

	log.Println("Database health check passed")

	// Initialize Kafka producer
	// Requirement 14.2: Initialize Kafka producer
	kafkaProducer := kafka.NewProducer(config.KafkaBrokers)
	defer kafkaProducer.Close()

	log.Println("Kafka producer initialized")

	// Dependency injection - create all components
	// Requirement 14.5: Dependency injection
	quizRepo := repository.NewPostgresQuizRepository(db)
	validator := service.NewAnswerValidator()
	statsTracker := service.NewStatsTracker(quizRepo, db)
	
	// Create event publisher adapter to bridge Kafka producer and service interface
	eventPublisher := &eventPublisherAdapter{producer: kafkaProducer}

	// Create service layer
	quizService := service.NewQuizService(quizRepo, statsTracker, validator, eventPublisher)

	// Create handler layer
	quizHandler := handler.NewQuizHandler(quizService)

	// Create gRPC server
	// Requirement 14.3: Create gRPC server and start on port 50052
	// Chain interceptors together
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(recoveryInterceptor, loggingInterceptor),
	)

	// Register Quiz Service
	pb.RegisterQuizServiceServer(grpcServer, quizHandler)

	// Register health check service
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("quiz.QuizService", grpc_health_v1.HealthCheckResponse_SERVING)

	// Register reflection service for debugging
	reflection.Register(grpcServer)

	// Start listening on the configured port
	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", config.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", config.GRPCPort, err)
	}

	// Start gRPC server in a goroutine
	go func() {
		log.Printf("Quiz Service listening on port %s", config.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	// Graceful shutdown handling
	// Requirement 14.5: Graceful shutdown implementation
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Quiz Service...")

	// Graceful shutdown with timeout
	grpcServer.GracefulStop()

	log.Println("Quiz Service stopped")
}

// initDatabase initializes the PostgreSQL database connection
// Requirement 14.1: PostgreSQL database connection initialization
func initDatabase(config *Config) (*sql.DB, error) {
	// Build connection string
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		config.DBHost,
		config.DBPort,
		config.DBUser,
		config.DBPassword,
		config.DBName,
	)

	// Open database connection
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}

// waitForDatabase waits for the database to be ready
// Requirement 17.5: Health check implementation - wait for database connection
func waitForDatabase(db *sql.DB, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("database health check timeout after %v", timeout)
		case <-ticker.C:
			if err := db.PingContext(ctx); err == nil {
				return nil
			}
			log.Println("Waiting for database to be ready...")
		}
	}
}

// loggingInterceptor logs all incoming gRPC requests
// Requirement 14.5: Logging implementation
func loggingInterceptor(
	ctx context.Context,
	req interface{},
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (interface{}, error) {
	start := time.Now()

	// Call the handler
	resp, err := handler(ctx, req)

	// Log the request
	duration := time.Since(start)
	if err != nil {
		log.Printf("[ERROR] %s - %v (took %v)", info.FullMethod, err, duration)
	} else {
		log.Printf("[INFO] %s - OK (took %v)", info.FullMethod, duration)
	}

	return resp, err
}

// recoveryInterceptor recovers from panics and returns an error
// Requirement 14.5: Error handling - prevent panics from crashing the server
func recoveryInterceptor(
	ctx context.Context,
	req interface{},
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (resp interface{}, err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PANIC] %s - Recovered from panic: %v", info.FullMethod, r)
			err = fmt.Errorf("internal server error")
		}
	}()

	return handler(ctx, req)
}

// eventPublisherAdapter adapts the Kafka producer to the service.EventPublisher interface
type eventPublisherAdapter struct {
	producer *kafka.Producer
}

// PublishQuizAnswered converts service event to Kafka event and publishes it
func (a *eventPublisherAdapter) PublishQuizAnswered(ctx context.Context, event *service.QuizAnsweredEvent) error {
	kafkaEvent := &kafka.QuizAnsweredEvent{
		UserID:      event.UserID,
		QuestionID:  event.QuestionID,
		Correct:     event.Correct,
		XPEarned:    event.XPEarned,
		CoinsEarned: event.CoinsEarned,
		Timestamp:   time.Now(),
	}
	return a.producer.PublishQuizAnswered(ctx, kafkaEvent)
}
