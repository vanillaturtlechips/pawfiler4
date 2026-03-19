package handler

import (
	"context"

	"community/pb"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// LikePost - 게시글 좋아요
func (h *Handler) LikePost(ctx context.Context, req *pb.LikePostRequest) (*pb.LikePostResponse, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}
	defer tx.Rollback()

	// Use ON CONFLICT DO NOTHING to avoid race conditions between concurrent like requests.
	result, err := tx.ExecContext(ctx, `
		INSERT INTO community.likes (id, post_id, user_id, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (post_id, user_id) DO NOTHING
	`, uuid.New().String(), req.PostId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	rowsAffected, _ := result.RowsAffected()
	// No rows inserted means the user already liked this post.
	if rowsAffected == 0 {
		if err = tx.Commit(); err != nil {
			return nil, status.Error(codes.Internal, "Failed to like post")
		}
		return &pb.LikePostResponse{Success: true, AlreadyLiked: true}, nil
	}

	var totalLikes int32
	err = tx.QueryRowContext(ctx, "UPDATE community.posts SET likes = likes + 1 WHERE id = $1 RETURNING likes", req.PostId).Scan(&totalLikes)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update like count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	return &pb.LikePostResponse{Success: true, AlreadyLiked: false, TotalLikes: totalLikes}, nil
}

// UnlikePost - 게시글 좋아요 취소
func (h *Handler) UnlikePost(ctx context.Context, req *pb.UnlikePostRequest) (*pb.UnlikePostResponse, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, "DELETE FROM community.likes WHERE post_id = $1 AND user_id = $2", req.PostId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		_, err = tx.ExecContext(ctx, "UPDATE community.posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1", req.PostId)
		if err != nil {
			return nil, status.Error(codes.Internal, "Failed to update like count")
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	return &pb.UnlikePostResponse{Success: true}, nil
}

// CheckLike - 좋아요 상태 확인
func (h *Handler) CheckLike(ctx context.Context, req *pb.CheckLikeRequest) (*pb.CheckLikeResponse, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	var liked bool
	err := h.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", req.PostId, req.UserId).Scan(&liked)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check like status")
	}

	return &pb.CheckLikeResponse{Liked: liked}, nil
}
