package handler

import (
	"context"
	"database/sql"
	"time"

	"community/pb"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"log"
)

// GetComments - 댓글 목록 조회
func (h *Handler) GetComments(ctx context.Context, req *pb.GetCommentsRequest) (*pb.CommentsResponse, error) {
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, post_id, author_id, author_nickname, author_emoji, content, created_at::text
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
		err := rows.Scan(&comment.Id, &comment.PostId, &comment.AuthorId, &comment.AuthorNickname,
			&comment.AuthorEmoji, &comment.Body, &comment.CreatedAt)
		if err != nil {
			log.Printf("Error scanning comment: %v", err)
			continue
		}
		comments = append(comments, &comment)
	}

	return &pb.CommentsResponse{Comments: comments}, nil
}

// CreateComment - 댓글 작성
func (h *Handler) CreateComment(ctx context.Context, req *pb.CreateCommentRequest) (*pb.Comment, error) {
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	var exists bool
	err := h.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.posts WHERE id = $1)", req.PostId).Scan(&exists)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check post")
	}
	if !exists {
		return nil, status.Error(codes.NotFound, "Post not found")
	}

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
	`, commentID, req.PostId, req.UserId, req.AuthorNickname, req.AuthorEmoji, req.Body, createdAt)

	if err != nil {
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
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Body:           req.Body,
		CreatedAt:      createdAt.Format(time.RFC3339),
	}, nil
}

// DeleteComment - 댓글 삭제
func (h *Handler) DeleteComment(ctx context.Context, req *pb.DeleteCommentRequest) (*pb.DeleteCommentResponse, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}
	defer tx.Rollback()

	var postID, authorID string
	err = tx.QueryRowContext(ctx, "SELECT post_id, author_id FROM community.comments WHERE id = $1", req.CommentId).Scan(&postID, &authorID)
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
