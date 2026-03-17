package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type RankingEntry struct {
	Rank           int32  `json:"rank"`
	UserId         string `json:"userId"`
	Nickname       string `json:"nickname"`
	Emoji          string `json:"emoji"`
	TierName       string `json:"tierName"`
	TotalAnswered  int32  `json:"totalAnswered"`
	CorrectAnswers int32  `json:"correctAnswers"`
	TotalCoins     int32  `json:"totalCoins"`
}

// HandleGetRanking - REST 핸들러로 직접 JSON 응답 (pb 타입 불필요)
func (h *Handler) HandleGetRanking(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SortBy string `json:"sort_by"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	entries, err := h.getRankingEntries(r.Context(), req.SortBy)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"entries": entries})
}

func (h *Handler) getRankingEntries(ctx context.Context, sortBy string) ([]*RankingEntry, error) {
	rows, err := h.db.QueryContext(ctx, `
		SELECT 
			p.author_id,
			p.author_nickname,
			p.author_emoji,
			COALESCE(qp.current_tier, '알') as current_tier,
			COALESCE(qs.total_answered, 0) as total_answered,
			COALESCE(qs.correct_answers, 0) as correct_answers,
			COALESCE(qp.total_coins, 0) as total_coins
		FROM (
			SELECT DISTINCT author_id, author_nickname, author_emoji
			FROM community.posts
		) p
		LEFT JOIN quiz.user_profiles qp ON qp.user_id::text = p.author_id
		LEFT JOIN quiz.user_stats qs ON qs.user_id::text = p.author_id
		ORDER BY COALESCE(qs.correct_answers, 0) DESC
		LIMIT 20
	`)
	if err != nil {
		log.Printf("Failed to query ranking: %v", err)
		return nil, status.Error(codes.Internal, "failed to query ranking")
	}
	defer rows.Close()

	var entries []*RankingEntry
	rank := int32(1)
	for rows.Next() {
		var userId, nickname, emoji, tier string
		var totalAnswered, correctAnswers, totalCoins int32
		if err := rows.Scan(&userId, &nickname, &emoji, &tier, &totalAnswered, &correctAnswers, &totalCoins); err != nil {
			continue
		}
		entries = append(entries, &RankingEntry{
			Rank:           rank,
			UserId:         userId,
			Nickname:       nickname,
			Emoji:          emoji,
			TierName:       tier,
			TotalAnswered:  totalAnswered,
			CorrectAnswers: correctAnswers,
			TotalCoins:     totalCoins,
		})
		rank++
	}
	return entries, nil
}
