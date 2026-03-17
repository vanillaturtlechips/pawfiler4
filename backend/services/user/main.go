// user-service: profile and shop REST API
package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

func initDB() error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://pawfiler:dev_password@postgres:5432/pawfiler?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", dbURL)
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
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()

	mux.HandleFunc("/health", withCORS(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, prefix := range []string{"", "/api"} {
		// Profile endpoints
		mux.HandleFunc(prefix+"/user.UserService/GetProfile", withCORS(handleGetProfile))
		mux.HandleFunc(prefix+"/user.UserService/UpdateProfile", withCORS(handleUpdateProfile))
		mux.HandleFunc(prefix+"/user.UserService/GetRecentActivities", withCORS(handleGetRecentActivities))

		// Shop endpoints
		mux.HandleFunc(prefix+"/user.UserService/GetShopItems", withCORS(handleGetShopItems))
		mux.HandleFunc(prefix+"/user.UserService/PurchaseItem", withCORS(handlePurchaseItem))
		mux.HandleFunc(prefix+"/user.UserService/GetPurchaseHistory", withCORS(handleGetPurchaseHistory))
	}

	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = "8083"
	}

	log.Printf("User service started on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
