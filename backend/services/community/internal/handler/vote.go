package handler

import (
	"context"
	"database/sql"

	"community/pb"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// VotePost - 게시글 투표
func (h *Handler) VotePost(ctx context.Context, req *pb.VotePostRequest) (*pb.VotePostResponse, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	var exists bool
	err = tx.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM community.post_votes WHERE post_id = $1 AND user_id = $2)",
		req.PostId, req.UserId).Scan(&exists)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check vote")
	}
	if exists {
		return &pb.VotePostResponse{Success: true, AlreadyVoted: true, XpEarned: 0}, nil
	}

	_, err = tx.ExecContext(ctx,
		"INSERT INTO community.post_votes (id, post_id, user_id, vote) VALUES ($1, $2, $3, $4)",
		uuid.New().String(), req.PostId, req.UserId, req.Vote)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to vote")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit")
	}

	return &pb.VotePostResponse{Success: true, AlreadyVoted: false, XpEarned: 1}, nil
}

// GetVoteResult - 투표 결과 조회
func (h *Handler) GetVoteResult(ctx context.Context, req *pb.GetVoteResultRequest) (*pb.VoteResult, error) {
	var trueVotes, falseVotes int32
	err := h.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN vote = true THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN vote = false THEN 1 ELSE 0 END), 0)
		FROM community.post_votes WHERE post_id = $1
	`, req.PostId).Scan(&trueVotes, &falseVotes)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to get vote result")
	}
	return &pb.VoteResult{PostId: req.PostId, TrueVotes: trueVotes, FalseVotes: falseVotes}, nil
}

// GetUserVote - 유저 투표 여부 확인
func (h *Handler) GetUserVote(ctx context.Context, req *pb.GetUserVoteRequest) (*pb.GetUserVoteResponse, error) {
	var vote bool
	err := h.db.QueryRowContext(ctx,
		"SELECT vote FROM community.post_votes WHERE post_id = $1 AND user_id = $2",
		req.PostId, req.UserId).Scan(&vote)
	if err == sql.ErrNoRows {
		return &pb.GetUserVoteResponse{Voted: false}, nil
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to get user vote")
	}
	return &pb.GetUserVoteResponse{Voted: true, Vote: vote}, nil
}
