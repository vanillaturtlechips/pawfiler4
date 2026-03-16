package main

import (
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"community/internal/handler"
	"community/internal/rest"
	"community/pb"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"
)

var db *sql.DB

// Database initialization
func initDB() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://pawfiler:dev_password@postgres:5432/pawfiler?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Connection pool settings optimized for high load
	db.SetMaxOpenConns(150)
	db.SetMaxIdleConns(50)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connected successfully")
	return nil
}

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "50053"
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	// 핸들러 생성
	h := handler.NewHandler(db)

	// gRPC 서버 시작
	s := grpc.NewServer()
	pb.RegisterCommunityServiceServer(s, h)

	go func() {
		log.Printf("Community gRPC server listening on :%s", port)
		if err := s.Serve(lis); err != nil {
			log.Fatalf("failed to serve gRPC: %v", err)
		}
	}()

	// REST 서버 시작
	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8081"
	}
	log.Printf("Community REST server started on :%s", httpPort)
	if err := http.ListenAndServe(":"+httpPort, rest.NewMuxWithDB(h, db)); err != nil {
		log.Fatalf("Failed to serve HTTP: %v", err)
	}
}
