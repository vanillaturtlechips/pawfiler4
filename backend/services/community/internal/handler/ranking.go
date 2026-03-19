package handler

import (
	"context"
	"log"
	"time"

	"community/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const rankingCacheTTL = 60 * time.Second

func (h *Handler) GetRanking(ctx context.Context, req *pb.GetRankingRequest) (*pb.GetRankingResponse, error) {
	// 캐시 확인 — 크로스 스키마 JOIN 비용을 60초마다 한 번만 지불
	h.rankingCacheMu.RLock()
	if h.rankingCache != nil && time.Now().Before(h.rankingCache.expiresAt) {
		cached := h.rankingCache.data
		h.rankingCacheMu.RUnlock()
		return cached, nil
	}
	h.rankingCacheMu.RUnlock()

	rows, err := h.db.QueryContext(ctx, `
		SELECT 
			qp.user_id::text,
			qp.nickname,
			qp.avatar_emoji,
			COALESCE(qp.current_tier, '알') as current_tier,
			COALESCE(qs.total_answered, 0) as total_answered,
			COALESCE(qs.correct_answers, 0) as correct_answers,
			COALESCE(qp.total_coins, 0) as total_coins
		FROM quiz.user_profiles qp
		LEFT JOIN quiz.user_stats qs ON qs.user_id = qp.user_id
		ORDER BY COALESCE(qs.correct_answers, 0) DESC
		LIMIT 20
	`)
	if err != nil {
		log.Printf("Failed to query ranking: %v", err)
		return nil, status.Error(codes.Internal, "failed to query ranking")
	}
	defer rows.Close()

	var entries []*pb.RankingEntry
	rank := int32(1)
	for rows.Next() {
		var userId, nickname, emoji, tier string
		var totalAnswered, correctAnswers, totalCoins int32
		if err := rows.Scan(&userId, &nickname, &emoji, &tier, &totalAnswered, &correctAnswers, &totalCoins); err != nil {
			continue
		}
		entries = append(entries, &pb.RankingEntry{
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
	result := &pb.GetRankingResponse{Entries: entries}

	// 캐시 갱신
	h.rankingCacheMu.Lock()
	h.rankingCache = &rankingCacheEntry{data: result, expiresAt: time.Now().Add(rankingCacheTTL)}
	h.rankingCacheMu.Unlock()

	return result, nil
}
