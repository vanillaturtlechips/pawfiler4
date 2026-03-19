package handler

import (
	"context"
	"database/sql"

	"community/pb"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// VotePost - 게시글 투표 (언제든지 변경 가능)
func (h *Handler) VotePost(ctx context.Context, req *pb.VotePostRequest) (*pb.VotePostResponse, error) {
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	var prevVote *bool
	var prevVoteVal bool
	err = tx.QueryRowContext(ctx,
		"SELECT vote FROM community.post_votes WHERE post_id = $1 AND user_id = $2",
		req.PostId, req.UserId).Scan(&prevVoteVal)
	if err == nil {
		prevVote = &prevVoteVal
	}

	if prevVote != nil {
		// 같은 값이면 변경 없음
		if *prevVote == req.Vote {
			return &pb.VotePostResponse{Success: true, AlreadyVoted: true, XpEarned: 0}, nil
		}
		// 다른 값이면 UPDATE
		_, err = tx.ExecContext(ctx,
			"UPDATE community.post_votes SET vote = $1 WHERE post_id = $2 AND user_id = $3",
			req.Vote, req.PostId, req.UserId)
		if err != nil {
			return nil, status.Error(codes.Internal, "Failed to update vote")
		}
	} else {
		// 첫 투표 INSERT
		_, err = tx.ExecContext(ctx,
			"INSERT INTO community.post_votes (id, post_id, user_id, vote) VALUES ($1, $2, $3, $4)",
			uuid.New().String(), req.PostId, req.UserId, req.Vote)
		if err != nil {
			return nil, status.Error(codes.Internal, "Failed to vote")
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit")
	}

	xpEarned := int32(0)
	if prevVote == nil {
		xpEarned = 1 // 첫 투표에만 XP
	}
	return &pb.VotePostResponse{Success: true, AlreadyVoted: false, XpEarned: xpEarned}, nil
}

// GetVoteResult - 투표 결과 조회
func (h *Handler) GetVoteResult(ctx context.Context, req *pb.GetVoteResultRequest) (*pb.VoteResult, error) {
	if req.PostId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id is required")
	}
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
	if req.PostId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
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
