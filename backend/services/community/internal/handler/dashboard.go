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
	// author_id로만 GROUP BY → 닉네임 변경 이력 있어도 단일 행 보장
	var authorID string
	var totalLikes int64
	err := h.db.QueryRowContext(ctx, `
		SELECT p.author_id, SUM(p.likes) as total_likes
		FROM community.posts p
		WHERE p.created_at >= DATE_TRUNC('month', NOW())
		GROUP BY p.author_id
		ORDER BY total_likes DESC
		LIMIT 1
	`).Scan(&authorID, &totalLikes)

	if err == sql.ErrNoRows {
		return &pb.TopDetectiveResponse{
			AuthorNickname: "아직 없음",
			AuthorEmoji:    "🏆",
			TotalLikes:     0,
		}, nil
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch top detective")
	}

	// 최신 닉네임/이모지 별도 조회 (가장 최근 게시글 기준)
	var detective pb.TopDetectiveResponse
	detective.TotalLikes = int32(totalLikes)
	err = h.db.QueryRowContext(ctx, `
		SELECT author_nickname, author_emoji
		FROM community.posts
		WHERE author_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, authorID).Scan(&detective.AuthorNickname, &detective.AuthorEmoji)
	if err != nil {
		detective.AuthorNickname = "알 수 없음"
		detective.AuthorEmoji = "🕵️"
	}

	return &detective, nil
}

// GetHotTopic - 인기 토픽 조회
// 오늘 데이터가 있으면 오늘 기준, 없으면 전체 기간 — 서브쿼리 없이 두 번의 QueryRow로 처리
func (h *Handler) GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error) {
	var topic pb.HotTopicResponse

	// 1차: 오늘 기준
	err := h.db.QueryRowContext(ctx, `
		SELECT tag, COUNT(*) as count
		FROM community.posts, UNNEST(tags) as tag
		WHERE created_at >= CURRENT_DATE
		GROUP BY tag
		ORDER BY count DESC
		LIMIT 1
	`).Scan(&topic.Tag, &topic.Count)

	if err == sql.ErrNoRows {
		// 2차: 전체 기간 fallback
		err = h.db.QueryRowContext(ctx, `
			SELECT tag, COUNT(*) as count
			FROM community.posts, UNNEST(tags) as tag
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

	return &topic, nil
}
