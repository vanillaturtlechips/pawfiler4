package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/pawfiler/backend/services/admin/internal/repository"
)

type ShopAdminHandler struct {
	repo *repository.ShopRepository
}

func NewShopAdminHandler(repo *repository.ShopRepository) *ShopAdminHandler {
	return &ShopAdminHandler{repo: repo}
}

// ListItems handles GET /admin/shop/items
func (h *ShopAdminHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.ListShopItems()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
		"total": len(items),
	})
}

// GetItem handles GET /admin/shop/items/{id}
func (h *ShopAdminHandler) GetItem(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	item, err := h.repo.GetShopItem(id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if item == nil {
		respondError(w, http.StatusNotFound, "item not found")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

// CreateItem handles POST /admin/shop/items
func (h *ShopAdminHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	var req repository.CreateShopItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Type == "" || req.Price < 0 {
		respondError(w, http.StatusBadRequest, "name, type, price are required")
		return
	}
	item, err := h.repo.CreateShopItem(&req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, item)
}

// UpdateItem handles PUT /admin/shop/items/{id}
func (h *ShopAdminHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req repository.UpdateShopItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.repo.UpdateShopItem(id, &req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if item == nil {
		respondError(w, http.StatusNotFound, "item not found")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

// DeleteItem handles DELETE /admin/shop/items/{id}
func (h *ShopAdminHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := h.repo.DeleteShopItem(id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}
