package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"
)

// levelFromExp returns level (1-5) based on total XP.
// Mirrors the quiz service logic so data is consistent.
func levelFromExp(exp int) int {
	switch {
	case exp >= 1500:
		return 5
	case exp >= 800:
		return 4
	case exp >= 400:
		return 3
	case exp >= 150:
		return 2
	default:
		return 1
	}
}

func tierNameFromLevel(level int) string {
	switch level {
	case 5:
		return "불사조 탐정"
	case 4:
		return "망토 입은 닭"
	case 3:
		return "안경 쓴 병아리"
	case 2:
		return "삐약이 정보원"
	default:
		return "알 껍데기 병아리"
	}
}

// handleGetProfile returns full user profile including game stats.
func handleGetProfile(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &req); err != nil || req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	ctx := r.Context()

	// 1. Preferences (nickname, avatar)
	var nickname, avatarEmoji string
	err := db.QueryRowContext(ctx,
		`SELECT nickname, avatar_emoji FROM user_svc.preferences WHERE user_id = $1`,
		req.UserID,
	).Scan(&nickname, &avatarEmoji)
	if err == sql.ErrNoRows {
		nickname = "탐정"
		avatarEmoji = "🦊"
	} else if err != nil {
		log.Printf("error fetching preferences: %v", err)
		nickname = "탐정"
		avatarEmoji = "🦊"
	}

	// 2. Game profile (XP, coins, energy)
	var totalExp, totalCoins, energy, maxEnergy int
	err = db.QueryRowContext(ctx,
		`SELECT total_exp, total_coins, energy, max_energy FROM quiz.user_profiles WHERE user_id = $1`,
		req.UserID,
	).Scan(&totalExp, &totalCoins, &energy, &maxEnergy)
	if err == sql.ErrNoRows {
		totalExp, totalCoins, energy, maxEnergy = 0, 0, 100, 100
	} else if err != nil {
		log.Printf("error fetching user_profiles: %v", err)
		totalExp, totalCoins, energy, maxEnergy = 0, 0, 100, 100
	}

	// 3. Quiz stats
	var totalAnswered, correctCount, currentStreak, bestStreak int
	err = db.QueryRowContext(ctx,
		`SELECT total_answered, correct_count, current_streak, best_streak FROM quiz.user_stats WHERE user_id = $1`,
		req.UserID,
	).Scan(&totalAnswered, &correctCount, &currentStreak, &bestStreak)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("error fetching user_stats: %v", err)
	}

	var correctRate float64
	if totalAnswered > 0 {
		correctRate = float64(correctCount) / float64(totalAnswered) * 100
	}

	// 4. Community post count
	var communityPosts int
	if err = db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM community.posts WHERE author_id = $1`,
		req.UserID,
	).Scan(&communityPosts); err != nil {
		log.Printf("error fetching community_posts count: %v", err)
	}

	// 5. Video analysis count
	var totalAnalysis int
	if err = db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM video_analysis.tasks WHERE user_id = $1`,
		req.UserID,
	).Scan(&totalAnalysis); err != nil {
		log.Printf("error fetching total_analysis count: %v", err)
	}

	level := levelFromExp(totalExp)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user_id":          req.UserID,
		"nickname":         nickname,
		"avatar_emoji":     avatarEmoji,
		"level":            level,
		"tier_name":        tierNameFromLevel(level),
		"total_exp":        totalExp,
		"total_coins":      totalCoins,
		"energy":           energy,
		"max_energy":       maxEnergy,
		"total_quizzes":    totalAnswered,
		"correct_rate":     correctRate,
		"total_analysis":   totalAnalysis,
		"community_posts":  communityPosts,
		"current_streak":   currentStreak,
		"best_streak":      bestStreak,
	})
}

// handleUpdateProfile updates nickname and/or avatar.
func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	var req struct {
		UserID      string `json:"user_id"`
		Nickname    string `json:"nickname"`
		AvatarEmoji string `json:"avatar_emoji"`
	}
	if err := readJSON(r, &req); err != nil || req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	ctx := r.Context()

	// Fetch current values to fill blanks
	var curNickname, curAvatar string
	if err := db.QueryRowContext(ctx,
		`SELECT nickname, avatar_emoji FROM user_svc.preferences WHERE user_id = $1`,
		req.UserID,
	).Scan(&curNickname, &curAvatar); err != nil {
		log.Printf("[UpdateProfile] failed to fetch current profile for %s: %v", req.UserID, err)
	}

	if req.Nickname == "" {
		req.Nickname = curNickname
	}
	if req.AvatarEmoji == "" {
		req.AvatarEmoji = curAvatar
	}
	if req.Nickname == "" {
		req.Nickname = "탐정"
	}
	if req.AvatarEmoji == "" {
		req.AvatarEmoji = "🦊"
	}

	_, err := db.ExecContext(ctx, `
		INSERT INTO user_svc.preferences (user_id, nickname, avatar_emoji, updated_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id) DO UPDATE
		SET nickname = EXCLUDED.nickname,
		    avatar_emoji = EXCLUDED.avatar_emoji,
		    updated_at = EXCLUDED.updated_at
	`, req.UserID, req.Nickname, req.AvatarEmoji, time.Now())

	if err != nil {
		log.Printf("error updating preferences: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"nickname":     req.Nickname,
		"avatar_emoji": req.AvatarEmoji,
	})
}

// handleGetRecentActivities returns the last 5 activities for a user.
func handleGetRecentActivities(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &req); err != nil || req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	ctx := r.Context()

	type Activity struct {
		Icon  string `json:"icon"`
		Title string `json:"title"`
		Time  string `json:"time"`
		XP    int    `json:"xp"`
	}

	var activities []Activity

	// Quiz answers
	rows, err := db.QueryContext(ctx, `
		SELECT xp_earned, answered_at
		FROM quiz.user_answers
		WHERE user_id = $1
		ORDER BY answered_at DESC
		LIMIT 5
	`, req.UserID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var xp int
			var answeredAt time.Time
			if err := rows.Scan(&xp, &answeredAt); err == nil {
				activities = append(activities, Activity{
					Icon:  "🎮",
					Title: "딥페이크 퀴즈 완료",
					Time:  formatTimeAgo(answeredAt),
					XP:    xp,
				})
			}
		}
	}

	// Community posts
	postRows, err := db.QueryContext(ctx, `
		SELECT created_at
		FROM community.posts
		WHERE author_id = $1
		ORDER BY created_at DESC
		LIMIT 3
	`, req.UserID)
	if err == nil {
		defer postRows.Close()
		for postRows.Next() {
			var createdAt time.Time
			if err := postRows.Scan(&createdAt); err == nil {
				activities = append(activities, Activity{
					Icon:  "📜",
					Title: "커뮤니티 게시글 작성",
					Time:  formatTimeAgo(createdAt),
					XP:    30,
				})
			}
		}
	}

	// Sort by most recent (simple approach: just return as-is, both are already DESC)
	if len(activities) > 5 {
		activities = activities[:5]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"activities": activities,
	})
}

func formatTimeAgo(t time.Time) string {
	diff := time.Since(t)
	switch {
	case diff < time.Minute:
		return "방금 전"
	case diff < time.Hour:
		return fmt.Sprintf("%d분 전", int(diff.Minutes()))
	case diff < 24*time.Hour:
		return fmt.Sprintf("%d시간 전", int(diff.Hours()))
	case diff < 7*24*time.Hour:
		return fmt.Sprintf("%d일 전", int(diff.Hours()/24))
	default:
		return t.Format("2006-01-02")
	}
}
