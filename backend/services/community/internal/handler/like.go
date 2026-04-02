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
	userID := userIDFromContext(ctx, req.UserId)
	if req.PostId == "" || userID == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO community.likes (id, post_id, user_id, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (post_id, user_id) DO NOTHING
	`, uuid.New().String(), req.PostId, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}
	if rowsAffected == 0 {
		if err = tx.Commit(); err != nil {
			return nil, status.Error(codes.Internal, "Failed to like post")
		}
		return &pb.LikePostResponse{Success: true, AlreadyLiked: true}, nil
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	// Redis로 카운터 증가 (Lua 스크립트로 원자성 보장)
	var totalLikes int64
	if h.rdb != nil {
		// Lua 스크립트: EXISTS 체크 → 없으면 DB 조회 후 SET → INCR → TTL 갱신
		script := `
			local key = KEYS[1]
			local ttl = tonumber(ARGV[1])
			local exists = redis.call('exists', key)
			if exists == 0 then
				-- 키 없으면 초기값 설정 (Go에서 DB 조회 후 전달)
				redis.call('set', key, ARGV[2])
			end
			local val = redis.call('incr', key)
			redis.call('expire', key, ttl)
			return val
		`
		
		// Redis 키 없으면 DB에서 초기값 조회
		var dbLikes int64
		exists, _ := h.rdb.Exists(ctx, "likes:"+req.PostId).Result()
		if exists == 0 {
			h.db.QueryRowContext(ctx, "SELECT likes FROM community.posts WHERE id = $1", req.PostId).Scan(&dbLikes)
		}
		
		// Lua 스크립트 실행 (24시간 TTL)
		result, err := h.rdb.Eval(ctx, script, []string{"likes:" + req.PostId}, 86400, dbLikes).Result()
		if err != nil {
			// Redis 실패: likes 테이블은 이미 INSERT 됐으므로 데이터는 안전
			// 30초 후 syncLikesToDB()가 정합성 보장
			return nil, status.Error(codes.Unavailable, "Cache temporarily unavailable, please retry")
		}
		if val, ok := result.(int64); ok {
			totalLikes = val
		}
	} else {
		h.db.ExecContext(ctx, "UPDATE community.posts SET likes = likes + 1 WHERE id = $1", req.PostId)
		h.db.QueryRowContext(ctx, "SELECT likes FROM community.posts WHERE id = $1", req.PostId).Scan(&totalLikes)
	}

	return &pb.LikePostResponse{Success: true, AlreadyLiked: false, TotalLikes: int32(totalLikes)}, nil
}

// UnlikePost - 게시글 좋아요 취소
func (h *Handler) UnlikePost(ctx context.Context, req *pb.UnlikePostRequest) (*pb.UnlikePostResponse, error) {
	userID := userIDFromContext(ctx, req.UserId)
	if req.PostId == "" || userID == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, "DELETE FROM community.likes WHERE post_id = $1 AND user_id = $2", req.PostId, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	if rowsAffected > 0 {
		if h.rdb != nil {
			// Lua 스크립트: EXISTS 체크 → 없으면 DB 조회 후 SET → DECR → TTL 갱신
			script := `
				local key = KEYS[1]
				local ttl = tonumber(ARGV[1])
				local exists = redis.call('exists', key)
				if exists == 0 then
					redis.call('set', key, ARGV[2])
				end
				local val = redis.call('decr', key)
				if val < 0 then
					redis.call('set', key, 0)
					val = 0
				end
				redis.call('expire', key, ttl)
				return val
			`
			
			// Redis 키 없으면 DB에서 초기값 조회
			var dbLikes int64
			exists, _ := h.rdb.Exists(ctx, "likes:"+req.PostId).Result()
			if exists == 0 {
				h.db.QueryRowContext(ctx, "SELECT likes FROM community.posts WHERE id = $1", req.PostId).Scan(&dbLikes)
			}
			
			// Lua 스크립트 실행 (24시간 TTL)
			_, err := h.rdb.Eval(ctx, script, []string{"likes:" + req.PostId}, 86400, dbLikes).Result()
			if err != nil {
				// Redis 실패: likes 테이블은 이미 DELETE 됐으므로 데이터는 안전
				// 30초 후 syncLikesToDB()가 정합성 보장
				return nil, status.Error(codes.Unavailable, "Cache temporarily unavailable, please retry")
			}
		} else {
			h.db.ExecContext(ctx, "UPDATE community.posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1", req.PostId)
		}
	}

	return &pb.UnlikePostResponse{Success: true}, nil
}

// CheckLike - 좋아요 상태 확인
func (h *Handler) CheckLike(ctx context.Context, req *pb.CheckLikeRequest) (*pb.CheckLikeResponse, error) {
	userID := userIDFromContext(ctx, req.UserId)
	if req.PostId == "" || userID == "" {
		return nil, status.Error(codes.InvalidArgument, "post_id and user_id are required")
	}
	var liked bool
	err := h.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", req.PostId, userID).Scan(&liked)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check like status")
	}

	return &pb.CheckLikeResponse{Liked: liked}, nil
}
