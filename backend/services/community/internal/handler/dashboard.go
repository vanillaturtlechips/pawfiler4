package handler

import (
	"context"
	"database/sql"

	"community/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"log"
)

// GetNotices - 공지사항 조회
func (h *Handler) GetNotices(ctx context.Context, req *pb.GetNoticesRequest) (*pb.NoticesResponse, error) {
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, title
		FROM community.posts
		WHERE tags @> ARRAY['공지']
		ORDER BY created_at DESC
		LIMIT 3
	`)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch notices")
	}
	defer rows.Close()

	notices := []*pb.Notice{}
	for rows.Next() {
		var notice pb.Notice
		if err := rows.Scan(&notice.Id, &notice.Title); err != nil {
			log.Printf("Error scanning notice: %v", err)
			continue
		}
		notices = append(notices, &notice)
	}

	return &pb.NoticesResponse{Notices: notices}, nil
}

// GetTopDetective - 탐정 랭킹 조회
func (h *Handler) GetTopDetective(ctx context.Context, req *pb.GetTopDetectiveRequest) (*pb.TopDetectiveResponse, error) {
	var detective pb.TopDetectiveResponse
	err := h.db.QueryRowContext(ctx, `
		SELECT p.author_nickname, p.author_emoji, SUM(p.likes) as total_likes
		FROM community.posts p
		WHERE p.created_at >= DATE_TRUNC('month', NOW())
		GROUP BY p.author_id, p.author_nickname, p.author_emoji
		ORDER BY total_likes DESC
		LIMIT 1
	`).Scan(&detective.AuthorNickname, &detective.AuthorEmoji, &detective.TotalLikes)

	if err == sql.ErrNoRows {
		detective = pb.TopDetectiveResponse{
			AuthorNickname: "아직 없음",
			AuthorEmoji:    "🏆",
			TotalLikes:     0,
		}
	} else if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch top detective")
	}

	return &detective, nil
}

// GetHotTopic - 인기 토픽 조회
func (h *Handler) GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error) {
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
			GROUP BY tag
			ORDER BY count DESC
			LIMIT 1
		`).Scan(&topic.Tag, &topic.Count)
	}

	if err == sql.ErrNoRows {
		topic = pb.HotTopicResponse{Tag: "없음", Count: 0}
	} else if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch hot topic")
	}

	return &topic, nil
}
