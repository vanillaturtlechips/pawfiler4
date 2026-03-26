package handler

import (
	"context"
	"database/sql"
	"time"

	"community/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// GetHotTopic - 인기 토픽 조회
// 오늘 데이터가 있으면 오늘 기준, 없으면 2주 기간
func (h *Handler) GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error) {
	h.hotTopicCacheMu.RLock()
	if h.hotTopicCache != nil && time.Now().Before(h.hotTopicCache.expiresAt) {
		cached := h.hotTopicCache.data
		h.hotTopicCacheMu.RUnlock()
		return cached, nil
	}
	h.hotTopicCacheMu.RUnlock()

	// double-check: Lock 잡은 후 재확인 — 동시 요청의 중복 DB 쿼리 방지
	h.hotTopicCacheMu.Lock()
	defer h.hotTopicCacheMu.Unlock()
	if h.hotTopicCache != nil && time.Now().Before(h.hotTopicCache.expiresAt) {
		return h.hotTopicCache.data, nil
	}

	var topic pb.HotTopicResponse

	err := h.db.QueryRowContext(ctx, `
		SELECT tag, COUNT(*) as count
		FROM community.posts, UNNEST(tags) as tag
		WHERE created_at >= CURRENT_DATE
		GROUP BY tag
		ORDER BY count DESC
		LIMIT 1
	`).Scan(&topic.Tag, &topic.Count)

	if err == sql.ErrNoRows {
		err = h.db.QueryRowContext(ctx, `
			SELECT tag, COUNT(*) as count
			FROM community.posts, UNNEST(tags) as tag
			WHERE created_at >= NOW() - INTERVAL '14 days'
			GROUP BY tag
			ORDER BY count DESC
			LIMIT 1
		`).Scan(&topic.Tag, &topic.Count)
	}

	if err == sql.ErrNoRows {
		return &pb.HotTopicResponse{Tag: "없음", Count: 0}, nil
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch hot topic")
	}

	result := &pb.HotTopicResponse{Tag: topic.Tag, Count: topic.Count}
	h.hotTopicCache = &hotTopicCacheEntry{data: result, expiresAt: time.Now().Add(5 * time.Minute)}
	return result, nil
}
