package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/pawfiler/backend/services/admin/internal/repository"
)

type UserAdminHandler struct {
	repo *repository.UserRepository
}

func NewUserAdminHandler(repo *repository.UserRepository) *UserAdminHandler {
	return &UserAdminHandler{repo: repo}
}

// GET /admin/users
func (h *UserAdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	search := r.URL.Query().Get("search")

	users, total, err := h.repo.ListUsers(page, pageSize, search)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"users":      users,
		"totalCount": total,
		"page":       page,
	})
}

// DELETE /admin/users/{id}
func (h *UserAdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := h.repo.DeleteUser(id); err != nil {
		if err.Error() == "user not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT /admin/users/{id}/subscription
func (h *UserAdminHandler) UpdateSubscription(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req struct {
		SubscriptionType string `json:"subscriptionType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.repo.UpdateSubscription(id, req.SubscriptionType); err != nil {
		if err.Error() == "user not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
