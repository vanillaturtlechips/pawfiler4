package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/pawfiler/backend/services/admin/internal/repository"
)

type CommunityAdminHandler struct {
	repo *repository.CommunityRepository
}

func NewCommunityAdminHandler(repo *repository.CommunityRepository) *CommunityAdminHandler {
	return &CommunityAdminHandler{repo: repo}
}

type ListPostsResponse struct {
	Posts      []repository.Post `json:"posts"`
	TotalCount int               `json:"totalCount"`
	Page       int               `json:"page"`
}

type GetCommentsResponse struct {
	Comments []repository.Comment `json:"comments"`
}

// GET /admin/community/posts
func (h *CommunityAdminHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	search := r.URL.Query().Get("search")
	searchType := r.URL.Query().Get("search_type")

	posts, total, err := h.repo.ListPosts(page, pageSize, search, searchType)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, ListPostsResponse{
		Posts:      posts,
		TotalCount: total,
		Page:       page,
	})
}

// PUT /admin/community/posts/{id}
func (h *CommunityAdminHandler) UpdatePost(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var req repository.UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.repo.UpdatePost(id, &req); err != nil {
		if err.Error() == "post not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /admin/community/posts/{id}
func (h *CommunityAdminHandler) DeletePost(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.repo.DeletePost(id); err != nil {
		if err.Error() == "post not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /admin/community/posts/{id}/comments
func (h *CommunityAdminHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	postID := mux.Vars(r)["id"]

	comments, err := h.repo.GetComments(postID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, GetCommentsResponse{Comments: comments})
}

// DELETE /admin/community/comments/{id}
func (h *CommunityAdminHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.repo.DeleteComment(id); err != nil {
		if err.Error() == "comment not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
