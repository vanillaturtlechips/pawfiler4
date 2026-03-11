package main

import (
	"database/sql"
	"log"
	"net"
	"os"
	"time"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"

	pb "github.com/pawfiler/backend/services/quiz/proto"
	"github.com/pawfiler/backend/services/quiz/internal/handler"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"github.com/pawfiler/backend/services/quiz/internal/service"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Connection pool settings for high load
	db.SetMaxOpenConns(100)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Successfully connected to PostgreSQL")

	repo := repository.NewQuizRepository(db)
	statsTracker := service.NewStatsTracker(repo)
	validator := service.NewAnswerValidator()
	svc := service.NewQuizService(repo, statsTracker, validator)
	quizHandler := handler.NewQuizHandler(svc)

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

	log.Printf("Quiz Service started on :%s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
