package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GormQuizRepository GORM + Redis를 사용하는 QuizRepository 구현
type GormQuizRepository struct {
	db            *gorm.DB
	redis         *redis.Client
	questions     []Question
	questionIndex map[string]int // ID → slice index, O(1) 탐색용
	mu            sync.RWMutex
	workerStarted bool
	workerMu      sync.Mutex
}

// NewGormQuizRepository GORM + Redis 기반 repository 생성
func NewGormQuizRepository(db *gorm.DB, redisClient *redis.Client) QuizRepository {
	repo := &GormQuizRepository{
		db:    db,
		redis: redisClient,
	}

	if redisClient == nil {
		log.Println("[WARN] Redis unavailable — quiz service running in DB-only mode")
	}

	err := db.AutoMigrate(&GormQuestion{}, &GormUserAnswer{}, &GormUserStats{}, &GormUserProfile{})
	if err != nil {
		log.Printf("Failed to migrate tables: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := repo.LoadQuestions(ctx); err != nil {
		log.Printf("Warning: Failed to load questions: %v", err)
	}

	repo.StartAutoRefresh(30 * time.Second)
	repo.ensureWorkerStarted()

	return repo
}

// LoadQuestions 모든 문제를 메모리에 로드 (DB 직접 조회)
func (r *GormQuizRepository) LoadQuestions(ctx context.Context) error {
	var gormQuestions []GormQuestion
	err := r.db.WithContext(ctx).Find(&gormQuestions).Error
	if err != nil {
		return fmt.Errorf("failed to query questions: %w", err)
	}

	questions := make([]Question, len(gormQuestions))
	for i, gq := range gormQuestions {
		questions[i] = *gq.ToQuestion()
	}

	index := make(map[string]int, len(questions))
	for i, q := range questions {
		index[q.ID] = i
	}
	r.mu.Lock()
	r.questions = questions
	r.questionIndex = index
	r.mu.Unlock()

	log.Printf("Loaded %d questions from database into memory", len(questions))
	return nil
}

// StartAutoRefresh 백그라운드에서 주기적으로 문제 리프레시
func (r *GormQuizRepository) StartAutoRefresh(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := r.LoadQuestions(ctx); err != nil {
				log.Printf("Auto-refresh failed: %v", err)
			}
			cancel()
		}
	}()
}

// GetRandomQuestion 메모리에서 랜덤 문제 선택 (중복 방지)
func (r *GormQuizRepository) GetRandomQuestion(ctx context.Context, userID string, difficulty *string, questionType *QuestionType) (*Question, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.questions) == 0 {
		return nil, fmt.Errorf("no questions loaded in cache")
	}

	var candidates []Question
	for _, q := range r.questions {
		if difficulty != nil && string(q.Difficulty) != *difficulty {
			continue
		}
		if questionType != nil && q.Type != *questionType {
			continue
		}
		candidates = append(candidates, q)
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no questions found matching criteria")
	}

	// Redis 없으면 seen 추적 없이 랜덤 선택
	if r.redis == nil {
		log.Printf("[WARN] Redis unavailable — skipping seen-question tracking for user %s", userID)
		return &candidates[rand.Intn(len(candidates))], nil
	}

	seenKey := fmt.Sprintf("quiz:seen:%s", userID)
	seenIDs, _ := r.redis.SMembers(ctx, seenKey).Result()
	seenSet := make(map[string]struct{}, len(seenIDs))
	for _, id := range seenIDs {
		seenSet[id] = struct{}{}
	}

	var unseen []Question
	for _, q := range candidates {
		if _, alreadySeen := seenSet[q.ID]; !alreadySeen {
			unseen = append(unseen, q)
		}
	}

	pool := unseen
	if len(pool) == 0 {
		r.redis.Del(ctx, seenKey)
		pool = candidates
	}

	question := &pool[rand.Intn(len(pool))]
	r.redis.SAdd(ctx, seenKey, question.ID)
	r.redis.Expire(ctx, seenKey, 24*time.Hour)

	return question, nil
}

// GetQuestionById ID로 특정 문제 조회
func (r *GormQuizRepository) GetQuestionById(ctx context.Context, questionID string) (*Question, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if idx, ok := r.questionIndex[questionID]; ok {
		q := r.questions[idx]
		return &q, nil
	}

	return nil, fmt.Errorf("question not found: %s", questionID)
}

// SaveAnswer 답변을 Redis Queue에 저장 (배치 처리), Redis 없으면 DB 직접 저장
func (r *GormQuizRepository) SaveAnswer(ctx context.Context, answer *UserAnswer) error {
	if answer.ID == "" {
		answer.ID = uuid.New().String()
	}

	if r.redis == nil {
		log.Printf("[WARN] Redis unavailable — saving answer %s directly to DB", answer.ID)
		return r.saveAnswerToDB(ctx, answer)
	}

	answerJSON, err := json.Marshal(answer)
	if err != nil {
		return fmt.Errorf("failed to marshal answer: %w", err)
	}

	err = r.redis.LPush(ctx, "quiz:answer_queue", answerJSON).Err()
	if err != nil {
		log.Printf("Redis queue failed, falling back to direct DB save: %v", err)
		return r.saveAnswerToDB(ctx, answer)
	}

	count := r.redis.Incr(ctx, "quiz:answer_queue:count").Val()
	if count >= 10 {
		r.redis.Publish(ctx, "quiz:batch_ready", fmt.Sprintf("%d", count))
	}

	return nil
}

// saveAnswerToDB DB에 직접 저장 (fallback)
func (r *GormQuizRepository) saveAnswerToDB(ctx context.Context, answer *UserAnswer) error {
	var gormAnswer GormUserAnswer
	gormAnswer.FromUserAnswer(answer)

	err := r.db.WithContext(ctx).Create(&gormAnswer).Error
	if err != nil {
		return fmt.Errorf("failed to save answer to DB: %w", err)
	}

	return nil
}

// ensureWorkerStarted Worker가 한 번만 시작되도록 보장
func (r *GormQuizRepository) ensureWorkerStarted() {
	r.workerMu.Lock()
	defer r.workerMu.Unlock()

	if !r.workerStarted {
		r.workerStarted = true
		if r.redis == nil {
			log.Println("[WARN] Redis unavailable — answer worker not started, answers will be saved directly to DB")
			return
		}
		go r.startAnswerWorker()
		log.Println("Answer worker started")
	}
}

// startAnswerWorker 백그라운드에서 Redis Queue 배치 처리
func (r *GormQuizRepository) startAnswerWorker() {
	log.Println("Starting answer worker with batch processing...")

	ctx := context.Background()

	pubsub := r.redis.Subscribe(ctx, "quiz:batch_ready")
	defer pubsub.Close()

	backoff := 100 * time.Millisecond
	maxBackoff := 1 * time.Second

	for {
		select {
		case msg := <-pubsub.Channel():
			log.Printf("Received batch ready signal: %s", msg.Payload)

			lockKey := "quiz:answer_queue:lock"
			locked, err := r.redis.SetNX(ctx, lockKey, "1", 5*time.Second).Result()
			if err != nil || !locked {
				time.Sleep(backoff)
				backoff = minDuration(backoff*2, maxBackoff)
				continue
			}

			r.processBatch()
			backoff = 100 * time.Millisecond

		case <-time.After(5 * time.Second):
			countStr := r.redis.Get(ctx, "quiz:answer_queue:count").Val()
			if countStr != "" {
				var count int
				fmt.Sscanf(countStr, "%d", &count)
				if count >= 10 {
					r.redis.Publish(ctx, "quiz:batch_ready", countStr)
				}
			}
		}
	}
}

// processBatch 배치 처리 로직
func (r *GormQuizRepository) processBatch() {
	ctx := context.Background()
	batchSize := 10

	batch := []UserAnswer{}
	for i := 0; i < batchSize; i++ {
		result := r.redis.RPop(ctx, "quiz:answer_queue").Val()
		if result == "" {
			break
		}

		var answer UserAnswer
		if err := json.Unmarshal([]byte(result), &answer); err != nil {
			log.Printf("Failed to unmarshal answer: %v", err)
			r.redis.Incr(ctx, "quiz:answer_queue:count")
			continue
		}

		r.redis.Decr(ctx, "quiz:answer_queue:count")
		batch = append(batch, answer)
	}

	if len(batch) == 0 {
		r.redis.Del(ctx, "quiz:answer_queue:lock")
		return
	}

	gormAnswers := make([]GormUserAnswer, len(batch))
	for i, answer := range batch {
		gormAnswers[i].FromUserAnswer(&answer)
	}

	err := r.db.CreateInBatches(gormAnswers, len(gormAnswers)).Error
	if err != nil {
		log.Printf("Failed to save batch to DB: %v", err)
		for _, answer := range batch {
			answerCopy := answer
			answerJSON, marshalErr := json.Marshal(answer)
			if marshalErr != nil {
				log.Printf("Failed to marshal answer %s for re-queue: %v — falling back to direct DB save", answer.ID, marshalErr)
				if dbErr := r.saveAnswerToDB(ctx, &answerCopy); dbErr != nil {
					log.Printf("CRITICAL: Failed to save answer %s to DB: %v", answer.ID, dbErr)
				}
				continue
			}
			if pushErr := r.redis.LPush(ctx, "quiz:answer_queue", answerJSON).Err(); pushErr != nil {
				log.Printf("Re-queue failed for answer %s: %v — falling back to direct DB save", answer.ID, pushErr)
				if dbErr := r.saveAnswerToDB(ctx, &answerCopy); dbErr != nil {
					log.Printf("CRITICAL: Failed to save answer %s to DB: %v", answer.ID, dbErr)
				}
			} else {
				r.redis.Incr(ctx, "quiz:answer_queue:count")
			}
		}
	} else {
		log.Printf("Successfully saved %d answers to DB", len(batch))
	}

	r.redis.Del(ctx, "quiz:answer_queue:lock")

	remainingCountStr := r.redis.Get(ctx, "quiz:answer_queue:count").Val()
	if remainingCountStr != "" {
		var remainingCount int
		fmt.Sscanf(remainingCountStr, "%d", &remainingCount)
		if remainingCount >= 10 {
			r.redis.Publish(ctx, "quiz:batch_ready", remainingCountStr)
		}
	}
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

// GetUserStats 사용자 통계 조회
func (r *GormQuizRepository) GetUserStats(ctx context.Context, userID string) (*UserStats, error) {
	var gormStats GormUserStats
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&gormStats).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("user stats not found: %s", userID)
		}
		return nil, fmt.Errorf("failed to get user stats: %w", err)
	}

	return gormStats.ToUserStats(), nil
}

// UpdateUserStats 사용자 통계 업데이트
func (r *GormQuizRepository) UpdateUserStats(ctx context.Context, stats *UserStats) error {
	var gormStats GormUserStats
	gormStats.FromUserStats(stats)

	err := r.db.WithContext(ctx).Where("user_id = ?", stats.UserID).Updates(&gormStats).Error
	if err != nil {
		return fmt.Errorf("failed to update user stats: %w", err)
	}

	return nil
}

// CreateUserStats 새 사용자 통계 생성
func (r *GormQuizRepository) CreateUserStats(ctx context.Context, userID string) (*UserStats, error) {
	gormStats := GormUserStats{
		UserID:        userID,
		TotalAnswered: 0,
		CorrectCount:  0,
		CurrentStreak: 0,
		BestStreak:    0,
		Lives:         3,
		UpdatedAt:     time.Now(),
	}

	err := r.db.WithContext(ctx).Create(&gormStats).Error
	if err != nil {
		return nil, fmt.Errorf("failed to create user stats: %w", err)
	}

	return gormStats.ToUserStats(), nil
}

// GetUserProfile 사용자 게임화 프로필 조회
func (r *GormQuizRepository) GetUserProfile(ctx context.Context, userID string) (*UserProfile, error) {
	// Redis 캐시 조회
	if r.redis != nil {
		cacheKey := fmt.Sprintf("quiz:user_profile:%s", userID)
		if cached := r.redis.Get(ctx, cacheKey).Val(); cached != "" {
			var p UserProfile
			if err := json.Unmarshal([]byte(cached), &p); err == nil {
				return &p, nil
			}
		}
	} else {
		log.Printf("[WARN] Redis unavailable — fetching user profile %s directly from DB", userID)
	}

	var g GormUserProfile
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&g).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserProfileNotFound
		}
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}

	p := g.ToUserProfile()
	if r.redis != nil {
		if b, err := json.Marshal(p); err == nil {
			r.redis.Set(ctx, fmt.Sprintf("quiz:user_profile:%s", userID), b, 2*time.Minute)
		}
	}
	return p, nil
}

// CreateUserProfile 새 사용자 게임화 프로필 생성
func (r *GormQuizRepository) CreateUserProfile(ctx context.Context, userID string) (*UserProfile, error) {
	g := GormUserProfile{
		UserID:           userID,
		TotalExp:         0,
		TotalCoins:       500,
		Energy:           100,
		MaxEnergy:        100,
		LastEnergyRefill: time.Now(),
	}
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&g).Error; err != nil {
		return nil, fmt.Errorf("failed to create user profile: %w", err)
	}
	return g.ToUserProfile(), nil
}

// UpdateUserProfile 사용자 게임화 프로필 저장
func (r *GormQuizRepository) UpdateUserProfile(ctx context.Context, profile *UserProfile) error {
	var g GormUserProfile
	g.FromUserProfile(profile)
	if err := r.db.WithContext(ctx).Where("user_id = ?", profile.UserID).Save(&g).Error; err != nil {
		return fmt.Errorf("failed to update user profile: %w", err)
	}
	if r.redis != nil {
		r.redis.Del(ctx, fmt.Sprintf("quiz:user_profile:%s", profile.UserID))
	}
	return nil
}

// UpdateEnergy updates only energy-related fields
func (r *GormQuizRepository) UpdateEnergy(ctx context.Context, userID string, energy int32, lastRefill time.Time) error {
	result := r.db.WithContext(ctx).Model(&GormUserProfile{}).
		Where("user_id = ?", userID).
		Updates(map[string]interface{}{
			"energy":             energy,
			"last_energy_refill": lastRefill,
			"updated_at":         time.Now(),
		})
	if result.Error != nil {
		return fmt.Errorf("failed to update energy: %w", result.Error)
	}
	if r.redis != nil {
		r.redis.Del(ctx, fmt.Sprintf("quiz:user_profile:%s", userID))
	}
	return nil
}

// UpdateNicknameAvatar updates only nickname and avatar_emoji
func (r *GormQuizRepository) UpdateNicknameAvatar(ctx context.Context, userID, nickname, avatarEmoji string) error {
	result := r.db.WithContext(ctx).Model(&GormUserProfile{}).
		Where("user_id = ?", userID).
		Updates(map[string]interface{}{
			"nickname":     nickname,
			"avatar_emoji": avatarEmoji,
		})
	if result.Error != nil {
		return fmt.Errorf("failed to update nickname/avatar: %w", result.Error)
	}
	if r.redis != nil {
		r.redis.Del(ctx, fmt.Sprintf("quiz:user_profile:%s", userID))
	}
	return nil
}

// GetRanking returns ranked users
func (r *GormQuizRepository) GetRanking(ctx context.Context, sortBy string, limit int) ([]RankingEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	orderBy := "us.correct_count DESC"
	switch sortBy {
	case "accuracy":
		orderBy = "CASE WHEN COALESCE(us.total_answered,0)>0 THEN us.correct_count::float/us.total_answered ELSE 0 END DESC"
	case "tier":
		orderBy = "CASE up.current_tier WHEN '불사조' THEN 4 WHEN '맹금닭' THEN 3 WHEN '삐약이' THEN 2 ELSE 1 END DESC, up.total_exp DESC"
	case "coins":
		orderBy = "up.total_coins DESC"
	}

	query := `
		SELECT up.user_id,
			COALESCE(NULLIF(up.nickname,''), '') as nickname,
			COALESCE(NULLIF(up.avatar_emoji,''), '🥚') as avatar_emoji,
			COALESCE(NULLIF(up.current_tier,''), '알') as tier,
			up.total_exp, up.total_coins,
			COALESCE(us.total_answered, 0), COALESCE(us.correct_count, 0),
			CASE WHEN COALESCE(us.total_answered,0) > 0
				THEN ROUND(us.correct_count::numeric / us.total_answered * 100, 1)
				ELSE 0 END
		FROM quiz.user_profiles up
		LEFT JOIN quiz.user_stats us ON us.user_id = up.user_id
		WHERE COALESCE(us.total_answered, 0) > 0
		ORDER BY ` + orderBy + ` LIMIT $1`

	sqlDB, err := r.db.DB()
	if err != nil {
		return nil, err
	}
	rows, err := sqlDB.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []RankingEntry
	rank := 1
	for rows.Next() {
		var e RankingEntry
		if err := rows.Scan(&e.UserID, &e.Nickname, &e.AvatarEmoji, &e.Tier, &e.TotalExp, &e.TotalCoins, &e.TotalAnswered, &e.CorrectCount, &e.Accuracy); err != nil {
			continue
		}
		e.Rank = rank
		p := &UserProfile{TotalExp: e.TotalExp, CurrentTier: e.Tier}
		e.Level = int(p.Level())
		entries = append(entries, e)
		rank++
	}
	return entries, nil
}

// GetQuestionStats returns accuracy stats for questions
func (r *GormQuizRepository) GetQuestionStats(ctx context.Context, questionID *string) ([]QuestionStat, error) {
	sqlDB, err := r.db.DB()
	if err != nil {
		return nil, err
	}
	var query string
	var args []interface{}
	if questionID != nil && *questionID != "" {
		query = `SELECT question_id, COUNT(*) as total_attempts,
			CASE WHEN COUNT(*)>0 THEN ROUND(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::numeric/COUNT(*)*100,1) ELSE 0 END as accuracy
			FROM quiz.user_answers WHERE question_id=$1 GROUP BY question_id`
		args = []interface{}{*questionID}
	} else {
		query = `SELECT question_id, COUNT(*) as total_attempts,
			CASE WHEN COUNT(*)>0 THEN ROUND(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::numeric/COUNT(*)*100,1) ELSE 0 END as accuracy
			FROM quiz.user_answers GROUP BY question_id`
	}
	rows, err := sqlDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var stats []QuestionStat
	for rows.Next() {
		var s QuestionStat
		if err := rows.Scan(&s.ID, &s.TotalAttempts, &s.Accuracy); err != nil {
			continue
		}
		stats = append(stats, s)
	}
	return stats, nil
}

func (r *GormQuizRepository) ApplyAnswerRewards(ctx context.Context, userID string, isCorrect bool, xpDelta, coinDelta int32) (*UserStats, *UserProfile, error) {
	var stats *UserStats

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var gs GormUserStats
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&gs).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				gs = GormUserStats{UserID: userID, Lives: 3}
				tx.Create(&gs)
			} else {
				return err
			}
		}
		gs.TotalAnswered++
		if isCorrect {
			gs.CorrectCount++
			gs.CurrentStreak++
			if gs.CurrentStreak > gs.BestStreak {
				gs.BestStreak = gs.CurrentStreak
			}
		} else {
			gs.CurrentStreak = 0
		}
		gs.UpdatedAt = time.Now()
		if err := tx.Save(&gs).Error; err != nil {
			return err
		}
		stats = gs.ToUserStats()
		return nil
	})

	if err != nil {
		return nil, nil, fmt.Errorf("ApplyAnswerRewards tx failed: %w", err)
	}
	return stats, nil, nil
}
