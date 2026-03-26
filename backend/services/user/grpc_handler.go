package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	pb "user-service/pb"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type userServiceServer struct {
	pb.UnimplementedUserServiceServer
	db    *sql.DB
	redis *redis.Client // quiz 캐시 무효화용, nil이면 스킵
}

func (s *userServiceServer) GetProfile(ctx context.Context, req *pb.GetProfileRequest) (*pb.UserProfile, error) {
	userID := extractUserID(ctx, req.UserId)
	if userID == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	// 첫 조회 시 기본 row 자동 생성 — INSERT 실패 시 로그 기록
	// $1=uuid, $2=text(닉네임 prefix용)로 타입 분리하여 pq 타입 추론 충돌 방지
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO user_svc.preferences (user_id, nickname, avatar_emoji, updated_at)
		VALUES ($1::uuid, '탐정_' || UPPER(SUBSTRING($2, 1, 8)), '🦊', NOW())
		ON CONFLICT (user_id) DO NOTHING
	`, userID, userID); err != nil {
		log.Printf("[GetProfile] preferences auto-insert failed for %s: %v", userID, err)
	}

	// 8개 독립 쿼리 → 단일 쿼리로 통합 (DB 왕복 8회 → 1회)
	// LATERAL 서브쿼리로 필드별 기본값 fallback 유지
	var (
		nickname, avatarEmoji                              string
		totalExp, totalCoins, energy, maxEnergy            int
		totalAnswered, correctCount, currentStreak, bestStreak int
		communityPosts, totalLikesReceived, totalCommentsWritten int
		totalAnalysis, suspiciousVideos                    int
		avgConfidence                                      float64
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(p.nickname,      '탐정') AS nickname,
			COALESCE(p.avatar_emoji,  '🦊')  AS avatar_emoji,
			COALESCE(qp.total_exp,    0)      AS total_exp,
			COALESCE(qp.total_coins,  0)      AS total_coins,
			COALESCE(qp.energy,       100)    AS energy,
			COALESCE(qp.max_energy,   100)    AS max_energy,
			COALESCE(qs.total_answered,  0)   AS total_answered,
			COALESCE(qs.correct_count,   0)   AS correct_count,
			COALESCE(qs.current_streak,  0)   AS current_streak,
			COALESCE(qs.best_streak,     0)   AS best_streak,
			(SELECT COUNT(*)               FROM community.posts    WHERE author_id = $1)  AS community_posts,
			(SELECT COALESCE(SUM(likes),0) FROM community.posts    WHERE author_id = $1)  AS total_likes,
			(SELECT COUNT(*)               FROM community.comments WHERE author_id = $1)  AS total_comments,
			(SELECT COUNT(*)               FROM video_analysis.tasks WHERE user_id = $1::uuid)        AS total_analysis,
			(SELECT COUNT(*)               FROM video_analysis.tasks t
			 JOIN video_analysis.results r ON t.id = r.task_id
			 WHERE t.user_id = $1::uuid AND r.verdict != 'REAL')                                      AS suspicious_videos,
			(SELECT COALESCE(AVG(r.confidence_score)*100, 0)
			 FROM video_analysis.tasks t JOIN video_analysis.results r ON t.id = r.task_id
			 WHERE t.user_id = $1::uuid)                                                              AS avg_confidence
		FROM user_svc.preferences p
		LEFT JOIN quiz.user_profiles qp ON qp.user_id = p.user_id
		LEFT JOIN quiz.user_stats    qs ON qs.user_id  = p.user_id
		WHERE p.user_id = $1::uuid
	`, userID).Scan(
		&nickname, &avatarEmoji,
		&totalExp, &totalCoins, &energy, &maxEnergy,
		&totalAnswered, &correctCount, &currentStreak, &bestStreak,
		&communityPosts, &totalLikesReceived, &totalCommentsWritten,
		&totalAnalysis, &suspiciousVideos, &avgConfidence,
	)
	if err != nil {
		// preferences row가 아직 없을 경우 (INSERT가 경쟁 조건으로 누락된 경우) 기본값 사용
		log.Printf("[GetProfile] query failed for %s: %v", userID, err)
		nickname, avatarEmoji = "탐정", "🦊"
		energy, maxEnergy = 100, 100
	}

	var correctRate float64
	if totalAnswered > 0 {
		correctRate = float64(correctCount) / float64(totalAnswered) * 100
	}

	level := levelFromExp(int(totalExp))
	return &pb.UserProfile{
		UserId:               userID,
		Nickname:             nickname,
		AvatarEmoji:          avatarEmoji,
		Level:                int32(level),
		TierName:             tierNameFromLevel(level),
		TotalExp:             int32(totalExp),
		TotalCoins:           int32(totalCoins),
		Energy:               int32(energy),
		MaxEnergy:            int32(maxEnergy),
		TotalQuizzes:         int32(totalAnswered),
		CorrectRate:          correctRate,
		TotalAnalysis:        int32(totalAnalysis),
		CommunityPosts:       int32(communityPosts),
		CurrentStreak:        int32(currentStreak),
		BestStreak:           int32(bestStreak),
		TotalLikesReceived:   int32(totalLikesReceived),
		TotalCommentsWritten: int32(totalCommentsWritten),
		SuspiciousVideos:     int32(suspiciousVideos),
		AvgConfidence:        avgConfidence,
	}, nil
}

func (s *userServiceServer) UpdateProfile(ctx context.Context, req *pb.UpdateProfileRequest) (*pb.UpdateProfileResponse, error) {
	userID := extractUserID(ctx, req.UserId)
	if userID == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	// 사전 SELECT 제거 — COALESCE로 nil 필드는 기존 값 유지, RETURNING으로 실제 저장값 반환
	// DB 왕복 2회 → 1회
	var nicknameParam, avatarParam interface{}
	if req.Nickname != nil && *req.Nickname != "" {
		nicknameParam = *req.Nickname
	}
	if req.AvatarEmoji != nil && *req.AvatarEmoji != "" {
		avatarParam = *req.AvatarEmoji
	}

	var nickname, avatar string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO user_svc.preferences (user_id, nickname, avatar_emoji, updated_at)
		VALUES ($1::uuid, COALESCE($2, '탐정'), COALESCE($3, '🦊'), NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET
			nickname     = COALESCE($2::varchar, user_svc.preferences.nickname),
			avatar_emoji = COALESCE($3::varchar, user_svc.preferences.avatar_emoji),
			updated_at   = NOW()
		RETURNING nickname, avatar_emoji
	`, userID, nicknameParam, avatarParam).Scan(&nickname, &avatar)
	if err != nil {
		log.Printf("UpdateProfile error: %v", err)
		return nil, status.Error(codes.Internal, "failed to update profile")
	}

	// community.posts/comments author 정보 비동기 동기화
	// 인덱스(idx_posts_author_id, idx_comments_author_id) 적용 후 부하 없음
	// 프로필 변경 응답을 블로킹하지 않도록 goroutine 처리
	go func(uid, nick, avi string) {
		bgCtx := context.Background()
		if _, err := s.db.ExecContext(bgCtx,
			`UPDATE community.posts SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3`,
			nick, avi, uid); err != nil {
			log.Printf("[UpdateProfile] failed to sync community posts for %s: %v", uid, err)
		}
		if _, err := s.db.ExecContext(bgCtx,
			`UPDATE community.comments SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3`,
			nick, avi, uid); err != nil {
			log.Printf("[UpdateProfile] failed to sync community comments for %s: %v", uid, err)
		}
	}(userID, nickname, avatar)

	return &pb.UpdateProfileResponse{Success: true, Nickname: nickname, AvatarEmoji: avatar}, nil
}

func (s *userServiceServer) GetRecentActivities(ctx context.Context, req *pb.GetRecentActivitiesRequest) (*pb.GetRecentActivitiesResponse, error) {
	userID := extractUserID(ctx, req.UserId)
	var activities []*pb.Activity

	rows, err := s.db.QueryContext(ctx, `
		SELECT xp_earned, answered_at FROM quiz.user_answers
		WHERE user_id = $1 ORDER BY answered_at DESC LIMIT 5`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var xp int
			var t time.Time
			if err := rows.Scan(&xp, &t); err == nil {
				activities = append(activities, &pb.Activity{Icon: "🎮", Title: "딥페이크 퀴즈 완료", Time: formatTimeAgo(t), Xp: int32(xp)})
			}
		}
	}

	postRows, err := s.db.QueryContext(ctx, `
		SELECT created_at FROM community.posts
		WHERE author_id = $1 ORDER BY created_at DESC LIMIT 3`, userID)
	if err == nil {
		defer postRows.Close()
		for postRows.Next() {
			var t time.Time
			if err := postRows.Scan(&t); err == nil {
				activities = append(activities, &pb.Activity{Icon: "📜", Title: "커뮤니티 게시글 작성", Time: formatTimeAgo(t), Xp: 30})
			}
		}
	}

	if len(activities) > 5 {
		activities = activities[:5]
	}
	return &pb.GetRecentActivitiesResponse{Activities: activities}, nil
}

func (s *userServiceServer) GetShopItems(ctx context.Context, req *pb.GetShopItemsRequest) (*pb.GetShopItemsResponse, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, description, price, icon, badge, type, quantity, bonus
		FROM user_svc.shop_items WHERE is_active = true ORDER BY price ASC`)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to fetch shop items")
	}
	defer rows.Close()

	var items []*pb.ShopItem
	for rows.Next() {
		var item pb.ShopItem
		var badge sql.NullString
		if err := rows.Scan(&item.Id, &item.Name, &item.Description, &item.Price,
			&item.Icon, &badge, &item.Type, &item.Quantity, &item.Bonus); err == nil {
			item.Badge = badge.String
			items = append(items, &item)
		}
	}
	return &pb.GetShopItemsResponse{Items: items}, nil
}

func (s *userServiceServer) PurchaseItem(ctx context.Context, req *pb.PurchaseItemRequest) (*pb.PurchaseItemResponse, error) {
	userID := extractUserID(ctx, req.UserId)
	if userID == "" || req.ItemId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id and item_id required")
	}

	var item pb.ShopItem
	var badge sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, description, price, icon, badge, type, quantity, bonus
		FROM user_svc.shop_items WHERE id = $1 AND is_active = true`, req.ItemId,
	).Scan(&item.Id, &item.Name, &item.Description, &item.Price, &item.Icon, &badge, &item.Type, &item.Quantity, &item.Bonus)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "item not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "internal server error")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "internal server error")
	}
	defer tx.Rollback()

	var totalCoins int32
	err = tx.QueryRowContext(ctx,
		`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`, userID,
	).Scan(&totalCoins)
	if err != nil {
		if _, insertErr := tx.ExecContext(ctx, `
			INSERT INTO quiz.user_profiles (user_id, total_exp, total_coins, energy, max_energy, last_energy_refill, updated_at)
			VALUES ($1, 0, 0, 100, 100, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`, userID); insertErr != nil {
			return nil, status.Error(codes.Internal, "failed to initialize profile")
		}
		if err = tx.QueryRowContext(ctx,
			`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`, userID,
		).Scan(&totalCoins); err != nil {
			return nil, status.Error(codes.Internal, "failed to fetch profile")
		}
	}

	if totalCoins < item.Price {
		return &pb.PurchaseItemResponse{Success: false, Error: "코인이 부족합니다", TotalCoins: totalCoins}, nil
	}

	newCoins := totalCoins - item.Price
	if _, err = tx.ExecContext(ctx, `UPDATE quiz.user_profiles SET total_coins = $1, updated_at = NOW() WHERE user_id = $2`, newCoins, userID); err != nil {
		return nil, status.Error(codes.Internal, "failed to deduct coins")
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO user_svc.shop_purchases (id, user_id, item_id, item_name, item_type, coins_paid, purchased_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
		userID, item.Id, item.Name, item.Type, item.Price); err != nil {
		return nil, status.Error(codes.Internal, "failed to record purchase")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "internal server error")
	}
	return &pb.PurchaseItemResponse{Success: true, ItemName: item.Name, CoinsPaid: item.Price, TotalCoins: newCoins}, nil
}

func (s *userServiceServer) GetPurchaseHistory(ctx context.Context, req *pb.GetPurchaseHistoryRequest) (*pb.GetPurchaseHistoryResponse, error) {
	userID := extractUserID(ctx, req.UserId)
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, item_id, item_name, item_type, coins_paid, purchased_at
		FROM user_svc.shop_purchases WHERE user_id = $1
		ORDER BY purchased_at DESC LIMIT 20`, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "internal server error")
	}
	defer rows.Close()

	var purchases []*pb.Purchase
	for rows.Next() {
		var p pb.Purchase
		var t time.Time
		if err := rows.Scan(&p.Id, &p.ItemId, &p.ItemName, &p.ItemType, &p.CoinsPaid, &t); err == nil {
			p.PurchasedAt = t.Format(time.RFC3339)
			purchases = append(purchases, &p)
		}
	}
	return &pb.GetPurchaseHistoryResponse{Purchases: purchases}, nil
}

func (s *userServiceServer) AddRewards(ctx context.Context, req *pb.AddRewardsRequest) (*pb.AddRewardsResponse, error) {
	userID := extractUserID(ctx, req.UserId)
	if userID == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	// Wrap the entire operation in a transaction with a row-level lock to prevent
	// lost updates under concurrent requests (race condition fix).
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to start transaction")
	}
	defer tx.Rollback()

	// Ensure a profile row exists before locking.
	_, err = tx.ExecContext(ctx, `
		INSERT INTO quiz.user_profiles (user_id, total_exp, total_coins, energy, max_energy, last_energy_refill, updated_at)
		VALUES ($1, 0, 0, 100, 100, NOW(), NOW())
		ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to initialize profile")
	}

	// Lock the row to serialize concurrent reward grants for the same user.
	var totalExp, totalCoins int32
	var currentTier string
	err = tx.QueryRowContext(ctx,
		`SELECT total_exp, total_coins, COALESCE(current_tier, '알') FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`,
		userID,
	).Scan(&totalExp, &totalCoins, &currentTier)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get profile")
	}

	totalExp += req.XpDelta
	totalCoins += req.CoinDelta

	// 티어 승급 체크
	tierOrder := []string{"알", "삼빡이", "맹금닭", "불사조"}
	tierThreshold := map[string]int32{"알": 1000, "삼빡이": 2000, "맹금닭": 4000}
	for {
		threshold, ok := tierThreshold[currentTier]
		if !ok || totalExp < threshold {
			break
		}
		totalExp -= threshold
		for i, t := range tierOrder {
			if t == currentTier && i+1 < len(tierOrder) {
				currentTier = tierOrder[i+1]
				break
			}
		}
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE quiz.user_profiles SET total_exp=$1, total_coins=$2, current_tier=$3, updated_at=NOW() WHERE user_id=$4`,
		totalExp, totalCoins, currentTier, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to update profile")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "failed to commit")
	}

	// quiz-service Redis 캐시 무효화 — stale 캐시가 AddRewards 결과를 덮어쓰는 문제 방지
	if s.redis != nil {
		cacheKey := fmt.Sprintf("quiz:user_profile:%s", userID)
		if delErr := s.redis.Del(context.Background(), cacheKey).Err(); delErr != nil {
			log.Printf("[AddRewards] redis cache delete failed for %s: %v", userID, delErr)
		}
	}

	level := levelFromExp(int(totalExp))
	return &pb.AddRewardsResponse{
		Success:    true,
		TotalExp:   totalExp,
		TotalCoins: totalCoins,
		TierName:   currentTier,
		Level:      int32(level),
	}, nil
}
