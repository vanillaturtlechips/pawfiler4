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
	db           *gorm.DB
	redis        *redis.Client
	questions    []Question
	mu           sync.RWMutex
	workerStarted bool
	workerMu     sync.Mutex
}

// NewGormQuizRepository GORM + Redis 기반 repository 생성
func NewGormQuizRepository(db *gorm.DB, redisClient *redis.Client) QuizRepository {
	repo := &GormQuizRepository{
		db:    db,
		redis: redisClient,
	}

	// 테이블 자동 마이그레이션
	err := db.AutoMigrate(&GormQuestion{}, &GormUserAnswer{}, &GormUserStats{}, &GormUserProfile{})
	if err != nil {
		log.Printf("Failed to migrate tables: %v", err)
	}

	// 시작 시 문제 로드
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := repo.LoadQuestions(ctx); err != nil {
		log.Printf("Warning: Failed to load questions: %v", err)
	}

	// 30초마다 자동 리프레시
	repo.StartAutoRefresh(30 * time.Second)

	// Answer Worker 시작
	repo.ensureWorkerStarted()

	return repo
}

// LoadQuestions 모든 문제를 메모리에 로드 (DB 직접 조회)
func (r *GormQuizRepository) LoadQuestions(ctx context.Context) error {
	// 1. DB에서 직접 로드
	var gormQuestions []GormQuestion
	err := r.db.WithContext(ctx).Find(&gormQuestions).Error
	if err != nil {
		return fmt.Errorf("failed to query questions: %w", err)
	}

	// 2. GORM 모델을 기존 모델로 변환
	questions := make([]Question, len(gormQuestions))
	for i, gq := range gormQuestions {
		questions[i] = *gq.ToQuestion()
	}

	// 3. 메모리에 저장
	r.mu.Lock()
	r.questions = questions
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

// GetRandomQuestion 메모리에서 랜덤 문제 선택 (초고속)
func (r *GormQuizRepository) GetRandomQuestion(ctx context.Context, difficulty *string, questionType *QuestionType) (*Question, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.questions) == 0 {
		return nil, fmt.Errorf("no questions loaded in cache")
	}

	// 필터 없음: 랜덤 선택
	if difficulty == nil && questionType == nil {
		idx := rand.Intn(len(r.questions))
		return &r.questions[idx], nil
	}

	// 필터 적용: 메모리에서 필터링
	var filtered []Question
	for _, q := range r.questions {
		match := true

		if difficulty != nil && string(q.Difficulty) != *difficulty {
			match = false
		}

		if questionType != nil && q.Type != *questionType {
			match = false
		}

		if match {
			filtered = append(filtered, q)
		}
	}

	if len(filtered) == 0 {
		return nil, fmt.Errorf("no questions found matching criteria")
	}

	idx := rand.Intn(len(filtered))
	return &filtered[idx], nil
}

// GetQuestionById ID로 특정 문제 조회 (메모리에서 검색)
func (r *GormQuizRepository) GetQuestionById(ctx context.Context, questionID string) (*Question, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	// 메모리에서 ID로 검색
	for _, q := range r.questions {
		if q.ID == questionID {
			return &q, nil
		}
	}
	
	return nil, fmt.Errorf("question not found: %s", questionID)
}

// SaveAnswer 답변을 Redis Queue에 저장 (배치 처리)
func (r *GormQuizRepository) SaveAnswer(ctx context.Context, answer *UserAnswer) error {
	// UUID 생성
	if answer.ID == "" {
		answer.ID = uuid.New().String()
	}

	// 1. Redis Queue에 저장 (즉시 응답)
	answerJSON, err := json.Marshal(answer)
	if err != nil {
		return fmt.Errorf("failed to marshal answer: %w", err)
	}

	err = r.redis.LPush(ctx, "quiz:answer_queue", answerJSON).Err()
	if err != nil {
		// Redis 실패 시 DB 직접 저장 (fallback)
		log.Printf("Redis queue failed, falling back to direct DB save: %v", err)
		return r.saveAnswerToDB(ctx, answer)
	}

	// 2. 카운터 증가
	count := r.redis.Incr(ctx, "quiz:answer_queue:count").Val()

	// 3. 10개 이상 쌓이면 Pub/Sub 알림
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
		go r.startAnswerWorker()
		log.Println("Answer worker started")
	}
}

// startAnswerWorker 백그라운드에서 Redis Queue 배치 처리
func (r *GormQuizRepository) startAnswerWorker() {
	log.Println("Starting answer worker with batch processing...")
	
	ctx := context.Background()
	
	// Pub/Sub 구독
	pubsub := r.redis.Subscribe(ctx, "quiz:batch_ready")
	defer pubsub.Close()

	// 백오프 설정
	backoff := 100 * time.Millisecond
	maxBackoff := 1 * time.Second

	for {
		select {
		case msg := <-pubsub.Channel():
			// 알림 받음
			log.Printf("Received batch ready signal: %s", msg.Payload)
			
			// 락 획득 시도 (5초 타임아웃)
			lockKey := "quiz:answer_queue:lock"
			locked, err := r.redis.SetNX(ctx, lockKey, "1", 5*time.Second).Result()
			if err != nil || !locked {
				// 락 획득 실패 (다른 워커가 처리 중)
				time.Sleep(backoff)
				backoff = minDuration(backoff*2, maxBackoff)
				continue
			}

			// 락 획득 성공! 배치 처리
			r.processBatch()
			
			// 백오프 리셋
			backoff = 100 * time.Millisecond

		case <-time.After(5 * time.Second):
			// 타임아웃: 혹시 알림 놓쳤는지 확인
			countStr := r.redis.Get(ctx, "quiz:answer_queue:count").Val()
			if countStr != "" {
				var count int
				fmt.Sscanf(countStr, "%d", &count)
				if count >= 10 {
					// 10개 이상인데 알림 안 왔으면 직접 처리 시도
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
	
	// 1. Redis에서 배치 크기만큼 가져오기
	batch := []UserAnswer{}
	for i := 0; i < batchSize; i++ {
		result := r.redis.RPop(ctx, "quiz:answer_queue").Val()
		if result == "" {
			break // 큐가 비었음
		}

		var answer UserAnswer
		if err := json.Unmarshal([]byte(result), &answer); err != nil {
			log.Printf("Failed to unmarshal answer: %v", err)
			// Unmarshal 실패 시 카운터 복구
			r.redis.Incr(ctx, "quiz:answer_queue:count")
			continue
		}

		// 성공 시에만 카운터 감소 (큐와 동기화)
		r.redis.Decr(ctx, "quiz:answer_queue:count")
		batch = append(batch, answer)
	}

	if len(batch) == 0 {
		// 가져올 데이터 없음
		r.redis.Del(ctx, "quiz:answer_queue:lock")
		return
	}

	// 2. DB에 배치 저장
	gormAnswers := make([]GormUserAnswer, len(batch))
	for i, answer := range batch {
		gormAnswers[i].FromUserAnswer(&answer)
	}

	err := r.db.CreateInBatches(gormAnswers, len(gormAnswers)).Error
	if err != nil {
		log.Printf("Failed to save batch to DB: %v", err)
		// 실패 시 다시 큐에 넣고 카운터 복구
		for _, answer := range batch {
			answerJSON, _ := json.Marshal(answer)
			r.redis.LPush(ctx, "quiz:answer_queue", answerJSON)
			r.redis.Incr(ctx, "quiz:answer_queue:count")
		}
	} else {
		log.Printf("Successfully saved %d answers to DB", len(batch))
	}

	// 3. 락 해제
	r.redis.Del(ctx, "quiz:answer_queue:lock")

	// 4. 아직 10개 이상 남았으면 다시 알림
	remainingCountStr := r.redis.Get(ctx, "quiz:answer_queue:count").Val()
	if remainingCountStr != "" {
		var remainingCount int
		fmt.Sscanf(remainingCountStr, "%d", &remainingCount)
		if remainingCount >= 10 {
			r.redis.Publish(ctx, "quiz:batch_ready", remainingCountStr)
		}
	}
}

// minDuration 두 Duration 중 작은 값 반환
func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

// GetUserStats 사용자 통계 조회 (DB 직접 조회)
func (r *GormQuizRepository) GetUserStats(ctx context.Context, userID string) (*UserStats, error) {
	// DB에서 직접 조회
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

// UpdateUserStats 사용자 통계 업데이트 (DB 직접 업데이트)
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
	cacheKey := fmt.Sprintf("quiz:user_profile:%s", userID)
	if cached := r.redis.Get(ctx, cacheKey).Val(); cached != "" {
		var p UserProfile
		if err := json.Unmarshal([]byte(cached), &p); err == nil {
			return &p, nil
		}
	}

	var g GormUserProfile
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&g).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserProfileNotFound
		}
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}

	p := g.ToUserProfile()
	if b, err := json.Marshal(p); err == nil {
		r.redis.Set(ctx, cacheKey, b, 2*time.Minute)
	}
	return p, nil
}

// CreateUserProfile 새 사용자 게임화 프로필 생성
func (r *GormQuizRepository) CreateUserProfile(ctx context.Context, userID string) (*UserProfile, error) {
	g := GormUserProfile{
		UserID:           userID,
		TotalExp:         0,
		TotalCoins:       500, // 신규 계정 웰컴 보너스
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
	r.redis.Del(ctx, fmt.Sprintf("quiz:user_profile:%s", profile.UserID))
	return nil
}

// UpdateNicknameAvatar updates only nickname and avatar_emoji, leaving coins/exp/energy untouched.
// This prevents stale Redis cache from clobbering coin values written by user-service AddRewards.
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
	r.redis.Del(ctx, fmt.Sprintf("quiz:user_profile:%s", userID))
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
		// 1. stats 업데이트
		var gs GormUserStats
		if err := tx.Where("user_id = ?", userID).First(&gs).Error; err != nil {
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