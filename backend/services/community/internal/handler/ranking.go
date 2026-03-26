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
	h.rankingCacheMu.RLock()
	if h.rankingCache != nil && time.Now().Before(h.rankingCache.expiresAt) {
		cached := h.rankingCache.data
		h.rankingCacheMu.RUnlock()
		return cached, nil
	}
	h.rankingCacheMu.RUnlock()

	// double-check: Lock 잡은 후 재확인 — 동시 요청의 중복 DB 쿼리 방지
	h.rankingCacheMu.Lock()
	defer h.rankingCacheMu.Unlock()
	if h.rankingCache != nil && time.Now().Before(h.rankingCache.expiresAt) {
		return h.rankingCache.data, nil
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT 
			qp.user_id::text,
			COALESCE(p.nickname, '탐정') as nickname,
			COALESCE(p.avatar_emoji, '🦊') as avatar_emoji,
			COALESCE(qp.current_tier, '알') as current_tier,
			COALESCE(qs.total_answered, 0) as total_answered,
			COALESCE(qs.correct_count, 0) as correct_count,
			COALESCE(qp.total_coins, 0) as total_coins,
			COALESCE(qp.total_exp, 0) as total_exp
		FROM quiz.user_profiles qp
		LEFT JOIN user_svc.preferences p ON p.user_id = qp.user_id
		LEFT JOIN quiz.user_stats qs ON qs.user_id = qp.user_id
		ORDER BY COALESCE(qs.correct_count, 0) DESC
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
		var totalAnswered, correctCount, totalCoins, totalExp int32
		if err := rows.Scan(&userId, &nickname, &emoji, &tier, &totalAnswered, &correctCount, &totalCoins, &totalExp); err != nil {
			continue
		}
		entries = append(entries, &pb.RankingEntry{
			Rank:           rank,
			UserId:         userId,
			Nickname:       nickname,
			Emoji:          emoji,
			TierName:       tier,
			TotalAnswered:  totalAnswered,
			CorrectAnswers: correctCount,
			TotalCoins:     totalCoins,
			Level:          calcLevel(tier, totalExp),
		})
		rank++
	}
	result := &pb.GetRankingResponse{Entries: entries}
	h.rankingCache = &rankingCacheEntry{data: result, expiresAt: time.Now().Add(rankingCacheTTL)}
	return result, nil
}

// calcLevel mirrors quiz service UserProfile.Level() logic
func calcLevel(tier string, totalExp int32) int32 {
	switch tier {
	case "불사조":
		switch {
		case totalExp >= 8000:
			return 5
		case totalExp >= 6000:
			return 4
		case totalExp >= 4000:
			return 3
		case totalExp >= 2000:
			return 2
		default:
			return 1
		}
	case "맹금닭":
		switch {
		case totalExp >= 3200:
			return 5
		case totalExp >= 2400:
			return 4
		case totalExp >= 1600:
			return 3
		case totalExp >= 800:
			return 2
		default:
			return 1
		}
	case "삐약이":
		switch {
		case totalExp >= 1600:
			return 5
		case totalExp >= 1200:
			return 4
		case totalExp >= 800:
			return 3
		case totalExp >= 400:
			return 2
		default:
			return 1
		}
	default: // 알
		switch {
		case totalExp >= 800:
			return 5
		case totalExp >= 600:
			return 4
		case totalExp >= 400:
			return 3
		case totalExp >= 200:
			return 2
		default:
			return 1
		}
	}
}
