package handler

import (
	"context"
	"log"

	"community/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (h *Handler) SyncAuthorNickname(ctx context.Context, req *pb.SyncAuthorNicknameRequest) (*pb.SyncAuthorNicknameResponse, error) {
	if req.UserId == "" || req.Nickname == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id and nickname are required")
	}

	_, err := h.db.ExecContext(ctx, `
		UPDATE community.posts SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId)
	if err != nil {
		log.Printf("Failed to update posts for user %s: %v", req.UserId, err)
		return nil, status.Error(codes.Internal, "failed to update posts")
	}

	_, err = h.db.ExecContext(ctx, `
		UPDATE community.comments SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId)
	if err != nil {
		log.Printf("Failed to update comments for user %s: %v", req.UserId, err)
		return nil, status.Error(codes.Internal, "failed to update comments")
	}

	log.Printf("✅ Synced author nickname for user %s: %s %s", req.UserId, req.Nickname, req.AvatarEmoji)
	return &pb.SyncAuthorNicknameResponse{Success: true}, nil
}
