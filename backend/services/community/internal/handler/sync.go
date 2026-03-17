package handler

import (
	"encoding/json"
	"log"
	"net/http"
)

// HandleSyncAuthorNickname - REST 핸들러로 직접 JSON 응답 (pb 타입 불필요)
func (h *Handler) HandleSyncAuthorNickname(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserId      string `json:"user_id"`
		Nickname    string `json:"nickname"`
		AvatarEmoji string `json:"avatar_emoji"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.UserId == "" || req.Nickname == "" {
		http.Error(w, "user_id and nickname are required", http.StatusBadRequest)
		return
	}

	_, err := h.db.ExecContext(r.Context(), `
		UPDATE community.posts SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId)
	if err != nil {
		log.Printf("Failed to update posts for user %s: %v", req.UserId, err)
		http.Error(w, "failed to update posts", http.StatusInternalServerError)
		return
	}

	_, err = h.db.ExecContext(r.Context(), `
		UPDATE community.comments SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId)
	if err != nil {
		log.Printf("Failed to update comments for user %s: %v", req.UserId, err)
		http.Error(w, "failed to update comments", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Synced author nickname for user %s: %s %s", req.UserId, req.Nickname, req.AvatarEmoji)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
