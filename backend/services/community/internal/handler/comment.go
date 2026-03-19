package handler

import (
	"context"
	"database/sql"
	"time"

	"community/pb"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"log"
)

// GetComments - 댓글 목록 조회
func (h *Handler) GetComments(ctx context.Context, req *pb.GetCommentsRequest) (*pb.CommentsResponse, error) {
	if req.PostId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id is required")
	}
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, post_id, author_id, author_nickname, author_emoji, content, created_at
		FROM community.comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`, req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch comments")
	}
	defer rows.Close()

	comments := []*pb.Comment{}
	for rows.Next() {
		var comment pb.Comment
		var createdAt time.Time
		err := rows.Scan(&comment.Id, &comment.PostId, &comment.AuthorId, &comment.AuthorNickname,
			&comment.AuthorEmoji, &comment.Body, &createdAt)
		if err != nil {
			log.Printf("Error scanning comment: %v", err)
			continue
		}
		comment.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		comments = append(comments, &comment)
	}

	return &pb.CommentsResponse{Comments: comments}, nil
}

// CreateComment - 댓글 작성
func (h *Handler) CreateComment(ctx context.Context, req *pb.CreateCommentRequest) (*pb.Comment, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	// Fetch authoritative profile from user service to prevent author spoofing.
	nickname, avatarEmoji := h.userClient.GetProfile(ctx, req.UserId)

	commentID := uuid.New().String()
	createdAt := time.Now()

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO community.comments (id, post_id, author_id, author_nickname, author_emoji, content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, commentID, req.PostId, req.UserId, nickname, avatarEmoji, req.Body, createdAt)

	if err != nil {
		// FK 위반 = post 없음
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23503" {
			return nil, status.Error(codes.NotFound, "Post not found")
		}
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}

	_, err = tx.ExecContext(ctx, "UPDATE community.posts SET comments = comments + 1 WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update comment count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}

	return &pb.Comment{
		Id:             commentID,
		PostId:         req.PostId,
		AuthorId:       req.UserId,
		AuthorNickname: nickname,
		AuthorEmoji:    avatarEmoji,
		Body:           req.Body,
		CreatedAt:      createdAt.Format(time.RFC3339),
	}, nil
}

// DeleteComment - 댓글 삭제
func (h *Handler) DeleteComment(ctx context.Context, req *pb.DeleteCommentRequest) (*pb.DeleteCommentResponse, error) {
	if req.CommentId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "comment_id and user_id are required")
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}
	defer tx.Rollback()

	// FOR UPDATE: 동시 삭제 요청이 같은 댓글을 대상으로 할 때 이중 카운터 감소 방지
	var postID, authorID string
	err = tx.QueryRowContext(ctx, "SELECT post_id, author_id FROM community.comments WHERE id = $1 FOR UPDATE", req.CommentId).Scan(&postID, &authorID)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Comment not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to find comment")
	}

	if authorID != req.UserId {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	_, err = tx.ExecContext(ctx, "DELETE FROM community.comments WHERE id = $1", req.CommentId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}

	_, err = tx.ExecContext(ctx, "UPDATE community.posts SET comments = GREATEST(comments - 1, 0) WHERE id = $1", postID)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update comment count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}

	return &pb.DeleteCommentResponse{Success: true}, nil
}
