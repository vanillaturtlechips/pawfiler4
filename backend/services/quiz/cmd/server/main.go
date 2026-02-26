package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"os"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"

	pb "github.com/pawfiler/backend/services/quiz/pb"
	"github.com/pawfiler/backend/services/quiz/internal/handler"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"github.com/pawfiler/backend/services/quiz/internal/service"
	"github.com/pawfiler/backend/services/quiz/pkg/kafka"
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

	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:29092"
	}

	producer := kafka.NewProducer(kafkaBrokers)
	defer producer.Close()

	repo := repository.NewQuizRepository(db)
	svc := service.NewQuizService(repo, producer)
	handler := handler.NewQuizHandler(svc)

	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterQuizServiceServer(grpcServer, handler)

	log.Println("Quiz Service started on :50052")
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
