package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/rs/cors"

	"github.com/pawfiler/backend/services/admin/internal/handler"
	"github.com/pawfiler/backend/services/admin/internal/repository"
	"github.com/pawfiler/backend/services/admin/internal/service"
)

func main() {
	// Database connection
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "pawfiler")
	dbPassword := getEnv("DB_PASSWORD", "pawfiler123")
	dbName := getEnv("DB_NAME", "pawfiler")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=require",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Connected to database successfully")

	// Initialize layers
	quizRepo := repository.NewQuizRepository(db)
	quizService := service.NewQuizAdminService(quizRepo)
	quizHandler := handler.NewQuizAdminHandler(quizService)

	// Setup router
	router := mux.NewRouter()
	
	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Admin Quiz routes
	adminRouter := router.PathPrefix("/admin/quiz").Subrouter()
	
	// TODO: Add auth middleware
	// adminRouter.Use(middleware.AuthMiddleware)
	
	adminRouter.HandleFunc("/questions", quizHandler.ListQuestions).Methods("GET")
	adminRouter.HandleFunc("/questions", quizHandler.CreateQuestion).Methods("POST")
	adminRouter.HandleFunc("/questions/{id}", quizHandler.GetQuestion).Methods("GET")
	adminRouter.HandleFunc("/questions/{id}", quizHandler.UpdateQuestion).Methods("PUT")
	adminRouter.HandleFunc("/questions/{id}", quizHandler.DeleteQuestion).Methods("DELETE")
	adminRouter.HandleFunc("/upload", quizHandler.UploadMedia).Methods("POST")

	// CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:3000",
			"http://localhost:5178",
			"http://localhost:5176",
			"http://localhost:5175",
			"http://localhost:5173",
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		Debug:            true,
	})

	handler := c.Handler(router)

	// Start server
	port := getEnv("PORT", "8082")
	log.Printf("Admin service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
