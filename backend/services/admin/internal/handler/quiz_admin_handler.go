package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/pawfiler/backend/services/admin/internal/repository"
	"github.com/pawfiler/backend/services/admin/internal/service"
)

type QuizAdminHandler struct {
	service *service.QuizAdminService
}

func NewQuizAdminHandler(service *service.QuizAdminService) *QuizAdminHandler {
	return &QuizAdminHandler{service: service}
}

type ListQuestionsResponse struct {
	Questions []repository.Question `json:"questions"`
	Total     int                   `json:"total"`
	Page      int                   `json:"page"`
	PageSize  int                   `json:"page_size"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type UploadMediaResponse struct {
	URL string `json:"url"`
}

// ListQuestions handles GET /admin/quiz/questions
func (h *QuizAdminHandler) ListQuestions(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	f := repository.ListQuestionsFilter{
		Type:       r.URL.Query().Get("type"),
		Difficulty: r.URL.Query().Get("difficulty"),
		Category:   r.URL.Query().Get("category"),
		Search:     r.URL.Query().Get("search"),
	}

	questions, total, err := h.service.ListQuestions(page, pageSize, f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, ListQuestionsResponse{
		Questions: questions,
		Total:     total,
		Page:      page,
		PageSize:  pageSize,
	})
}

// GetQuestion handles GET /admin/quiz/questions/{id}
func (h *QuizAdminHandler) GetQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	question, err := h.service.GetQuestion(id)
	if err != nil {
		if err.Error() == "question not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, question)
}

// CreateQuestion handles POST /admin/quiz/questions
func (h *QuizAdminHandler) CreateQuestion(w http.ResponseWriter, r *http.Request) {
	var req repository.CreateQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	question, err := h.service.CreateQuestion(&req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, question)
}

// UpdateQuestion handles PUT /admin/quiz/questions/{id}
func (h *QuizAdminHandler) UpdateQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var req repository.CreateQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	question, err := h.service.UpdateQuestion(id, &req)
	if err != nil {
		if err.Error() == "question not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, question)
}

// DeleteQuestion handles DELETE /admin/quiz/questions/{id}
func (h *QuizAdminHandler) DeleteQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := h.service.DeleteQuestion(id); err != nil {
		if err.Error() == "question not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UploadMedia handles POST /admin/quiz/upload
func (h *QuizAdminHandler) UploadMedia(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (max 100MB)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	// Get file
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	// Get metadata
	category := r.FormValue("category")
	mediaType := r.FormValue("media_type")
	difficulty := r.FormValue("difficulty")

	if category == "" || mediaType == "" || difficulty == "" {
		respondError(w, http.StatusBadRequest, "category, media_type, and difficulty are required")
		return
	}

	// Upload to S3
	url, err := h.service.UploadMedia(file, header.Filename, category, mediaType, difficulty)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, UploadMediaResponse{URL: url})
}

// Helper functions
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, ErrorResponse{Error: message})
}
