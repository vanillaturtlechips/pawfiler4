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

	// 트랜잭션으로 묶어야 posts 성공 + comments 실패로 인한 닉네임 불일치 방지
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to start transaction")
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		UPDATE community.posts SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId); err != nil {
		log.Printf("Failed to update posts for user %s: %v", req.UserId, err)
		return nil, status.Error(codes.Internal, "failed to update posts")
	}

	if _, err = tx.ExecContext(ctx, `
		UPDATE community.comments SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
	`, req.Nickname, req.AvatarEmoji, req.UserId); err != nil {
		log.Printf("Failed to update comments for user %s: %v", req.UserId, err)
		return nil, status.Error(codes.Internal, "failed to update comments")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "failed to commit sync")
	}

	log.Printf("✅ Synced author nickname for user %s: %s %s", req.UserId, req.Nickname, req.AvatarEmoji)
	return &pb.SyncAuthorNicknameResponse{Success: true}, nil
}
