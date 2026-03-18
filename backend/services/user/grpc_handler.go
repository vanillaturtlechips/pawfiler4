package main

import (
	"context"
	"database/sql"
	"log"
	"time"

	pb "user-service/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type userServiceServer struct {
	pb.UnimplementedUserServiceServer
	db *sql.DB
}

func (s *userServiceServer) GetProfile(ctx context.Context, req *pb.GetProfileRequest) (*pb.UserProfile, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	// 첫 조회 시 기본 row 자동 생성 - auth.users의 이메일 prefix를 nickname으로 사용
	s.db.ExecContext(ctx, `
		INSERT INTO user_svc.preferences (user_id, nickname, avatar_emoji, updated_at)
		SELECT $1,
			COALESCE(NULLIF(split_part(email, '@', 1), ''), '탐정'),
			'🦊',
			NOW()
		FROM auth.users WHERE id = $1
		ON CONFLICT (user_id) DO NOTHING
	`, req.UserId)

	var nickname, avatarEmoji string
	err := s.db.QueryRowContext(ctx,
		`SELECT nickname, avatar_emoji FROM user_svc.preferences WHERE user_id = $1`, req.UserId,
	).Scan(&nickname, &avatarEmoji)
	if err != nil {
		nickname, avatarEmoji = "탐정", "🦊"
	}

	var totalExp, totalCoins, energy, maxEnergy int
	err = s.db.QueryRowContext(ctx,
		`SELECT total_exp, total_coins, energy, max_energy FROM quiz.user_profiles WHERE user_id = $1`, req.UserId,
	).Scan(&totalExp, &totalCoins, &energy, &maxEnergy)
	if err != nil {
		totalExp, totalCoins, energy, maxEnergy = 0, 0, 100, 100
	}

	var totalAnswered, correctCount, currentStreak, bestStreak int
	s.db.QueryRowContext(ctx,
		`SELECT total_answered, correct_count, current_streak, best_streak FROM quiz.user_stats WHERE user_id = $1`, req.UserId,
	).Scan(&totalAnswered, &correctCount, &currentStreak, &bestStreak)

	var correctRate float64
	if totalAnswered > 0 {
		correctRate = float64(correctCount) / float64(totalAnswered) * 100
	}

	var communityPosts, totalAnalysis int
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM community.posts WHERE author_id = $1`, req.UserId).Scan(&communityPosts)
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM video_analysis.tasks WHERE user_id = $1`, req.UserId).Scan(&totalAnalysis)

	var totalLikesReceived, totalCommentsWritten, suspiciousVideos int
	var avgConfidence float64
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(likes), 0) FROM community.posts WHERE author_id = $1`, req.UserId).Scan(&totalLikesReceived)
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM community.comments WHERE author_id = $1`, req.UserId).Scan(&totalCommentsWritten)
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM video_analysis.tasks t
		JOIN video_analysis.results r ON t.id = r.task_id
		WHERE t.user_id = $1 AND r.verdict != 'REAL'`, req.UserId).Scan(&suspiciousVideos)
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(r.confidence_score) * 100, 0) FROM video_analysis.tasks t
		JOIN video_analysis.results r ON t.id = r.task_id
		WHERE t.user_id = $1`, req.UserId).Scan(&avgConfidence)

	level := levelFromExp(int(totalExp))
	return &pb.UserProfile{
		UserId:                req.UserId,
		Nickname:              nickname,
		AvatarEmoji:           avatarEmoji,
		Level:                 int32(level),
		TierName:              tierNameFromLevel(level),
		TotalExp:              int32(totalExp),
		TotalCoins:            int32(totalCoins),
		Energy:                int32(energy),
		MaxEnergy:             int32(maxEnergy),
		TotalQuizzes:          int32(totalAnswered),
		CorrectRate:           correctRate,
		TotalAnalysis:         int32(totalAnalysis),
		CommunityPosts:        int32(communityPosts),
		CurrentStreak:         int32(currentStreak),
		BestStreak:            int32(bestStreak),
		TotalLikesReceived:    int32(totalLikesReceived),
		TotalCommentsWritten:  int32(totalCommentsWritten),
		SuspiciousVideos:      int32(suspiciousVideos),
		AvgConfidence:         avgConfidence,
	}, nil
}

func (s *userServiceServer) UpdateProfile(ctx context.Context, req *pb.UpdateProfileRequest) (*pb.UpdateProfileResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	var curNickname, curAvatar string
	s.db.QueryRowContext(ctx,
		`SELECT nickname, avatar_emoji FROM user_svc.preferences WHERE user_id = $1`, req.UserId,
	).Scan(&curNickname, &curAvatar)

	nickname := curNickname
	avatar := curAvatar
	if req.Nickname != nil && *req.Nickname != "" {
		nickname = *req.Nickname
	}
	if req.AvatarEmoji != nil && *req.AvatarEmoji != "" {
		avatar = *req.AvatarEmoji
	}
	if nickname == "" {
		nickname = "탐정"
	}
	if avatar == "" {
		avatar = "🦊"
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_svc.preferences (user_id, nickname, avatar_emoji, updated_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id) DO UPDATE
		SET nickname = EXCLUDED.nickname, avatar_emoji = EXCLUDED.avatar_emoji, updated_at = EXCLUDED.updated_at
	`, req.UserId, nickname, avatar, time.Now())
	if err != nil {
		log.Printf("UpdateProfile error: %v", err)
		return nil, status.Error(codes.Internal, "failed to update profile")
	}
	return &pb.UpdateProfileResponse{Success: true, Nickname: nickname, AvatarEmoji: avatar}, nil
}

func (s *userServiceServer) GetRecentActivities(ctx context.Context, req *pb.GetRecentActivitiesRequest) (*pb.GetRecentActivitiesResponse, error) {
	var activities []*pb.Activity

	rows, err := s.db.QueryContext(ctx, `
		SELECT xp_earned, answered_at FROM quiz.user_answers
		WHERE user_id = $1 ORDER BY answered_at DESC LIMIT 5`, req.UserId)
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
		WHERE author_id = $1 ORDER BY created_at DESC LIMIT 3`, req.UserId)
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
	if req.UserId == "" || req.ItemId == "" {
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
		`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`, req.UserId,
	).Scan(&totalCoins)
	if err != nil {
		tx.ExecContext(ctx, `
			INSERT INTO quiz.user_profiles (user_id, total_exp, total_coins, energy, max_energy, last_energy_refill, updated_at)
			VALUES ($1, 0, 0, 100, 100, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`, req.UserId)
		tx.QueryRowContext(ctx,
			`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`, req.UserId,
		).Scan(&totalCoins)
	}

	if totalCoins < item.Price {
		return &pb.PurchaseItemResponse{Success: false, Error: "코인이 부족합니다", TotalCoins: totalCoins}, nil
	}

	newCoins := totalCoins - item.Price
	tx.ExecContext(ctx, `UPDATE quiz.user_profiles SET total_coins = $1, updated_at = NOW() WHERE user_id = $2`, newCoins, req.UserId)
	tx.ExecContext(ctx, `
		INSERT INTO user_svc.shop_purchases (id, user_id, item_id, item_name, item_type, coins_paid, purchased_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
		req.UserId, item.Id, item.Name, item.Type, item.Price)

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "internal server error")
	}
	return &pb.PurchaseItemResponse{Success: true, ItemName: item.Name, CoinsPaid: item.Price, TotalCoins: newCoins}, nil
}

func (s *userServiceServer) GetPurchaseHistory(ctx context.Context, req *pb.GetPurchaseHistoryRequest) (*pb.GetPurchaseHistoryResponse, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, item_id, item_name, item_type, coins_paid, purchased_at
		FROM user_svc.shop_purchases WHERE user_id = $1
		ORDER BY purchased_at DESC LIMIT 20`, req.UserId)
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
	if req.UserId == "" {
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
		ON CONFLICT (user_id) DO NOTHING`, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to initialize profile")
	}

	// Lock the row to serialize concurrent reward grants for the same user.
	var totalExp, totalCoins int32
	var currentTier string
	err = tx.QueryRowContext(ctx,
		`SELECT total_exp, total_coins, COALESCE(current_tier, '알') FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`,
		req.UserId,
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
		totalExp, totalCoins, currentTier, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to update profile")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "failed to commit")
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
