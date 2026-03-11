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
)

// GormQuizRepository GORM + Redis를 사용하는 QuizRepository 구현
type GormQuizRepository struct {
	db        *gorm.DB
	redis     *redis.Client
	questions []Question
	mu        sync.RWMutex
}

// NewGormQuizRepository GORM + Redis 기반 repository 생성
func NewGormQuizRepository(db *gorm.DB, redisClient *redis.Client) QuizRepository {
	repo := &GormQuizRepository{
		db:    db,
		redis: redisClient,
	}

	// 테이블 자동 마이그레이션
	err := db.AutoMigrate(&GormQuestion{}, &GormUserAnswer{}, &GormUserStats{})
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

	return repo
}

// LoadQuestions 모든 문제를 메모리에 로드 (Redis 캐시 활용)
func (r *GormQuizRepository) LoadQuestions(ctx context.Context) error {
	// 1. Redis 캐시 확인
	cacheKey := "quiz:questions:all"
	cached := r.redis.Get(ctx, cacheKey).Val()
	
	if cached != "" {
		var questions []Question
		if err := json.Unmarshal([]byte(cached), &questions); err == nil {
			r.mu.Lock()
			r.questions = questions
			r.mu.Unlock()
			log.Printf("Loaded %d questions from Redis cache", len(questions))
			return nil
		}
	}

	// 2. Redis 캐시 미스 시 DB에서 로드
	var gormQuestions []GormQuestion
	err := r.db.WithContext(ctx).Find(&gormQuestions).Error
	if err != nil {
		return fmt.Errorf("failed to query questions: %w", err)
	}

	// 3. GORM 모델을 기존 모델로 변환
	questions := make([]Question, len(gormQuestions))
	for i, gq := range gormQuestions {
		questions[i] = *gq.ToQuestion()
	}

	// 4. 메모리에 저장
	r.mu.Lock()
	r.questions = questions
	r.mu.Unlock()

	// 5. Redis에 캐시 (5분 TTL)
	questionsJSON, _ := json.Marshal(questions)
	r.redis.Set(ctx, cacheKey, questionsJSON, 5*time.Minute)

	log.Printf("Loaded %d questions from database and cached to Redis", len(questions))
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
		randomQuestion := r.questions[rand.Intn(len(r.questions))]
		return &randomQuestion, nil
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

	randomQuestion := filtered[rand.Intn(len(filtered))]
	return &randomQuestion, nil
}

// GetQuestionById ID로 특정 문제 조회 (Redis 캐시 활용)
func (r *GormQuizRepository) GetQuestionById(ctx context.Context, questionID string) (*Question, error) {
	// 1. Redis 캐시 확인
	cacheKey := fmt.Sprintf("quiz:question:%s", questionID)
	cached := r.redis.Get(ctx, cacheKey).Val()
	
	if cached != "" {
		var question Question
		if err := json.Unmarshal([]byte(cached), &question); err == nil {
			return &question, nil
		}
	}

	// 2. DB에서 조회
	var gormQuestion GormQuestion
	err := r.db.WithContext(ctx).Where("id = ?", questionID).First(&gormQuestion).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("question not found: %s", questionID)
		}
		return nil, fmt.Errorf("failed to get question by id: %w", err)
	}

	question := gormQuestion.ToQuestion()

	// 3. Redis에 캐시 (10분 TTL)
	questionJSON, _ := json.Marshal(question)
	r.redis.Set(ctx, cacheKey, questionJSON, 10*time.Minute)

	return question, nil
}

// SaveAnswer 답변을 Redis Queue에 저장 (비동기 처리)
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

	// 2. 백그라운드 Worker 시작 (한 번만)
	go r.startAnswerWorker()

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

// startAnswerWorker 백그라운드에서 Redis Queue 처리
func (r *GormQuizRepository) startAnswerWorker() {
	// 중복 실행 방지
	static := struct {
		once sync.Once
	}{}

	static.once.Do(func() {
		go func() {
			log.Println("Starting answer worker...")
			for {
				ctx := context.Background()
				
				// Redis Queue에서 답변 가져오기 (블로킹, 최대 5초 대기)
				result := r.redis.BRPop(ctx, 5*time.Second, "quiz:answer_queue").Val()
				if len(result) < 2 {
					continue // 타임아웃 또는 빈 큐
				}

				answerJSON := result[1]
				var answer UserAnswer
				if err := json.Unmarshal([]byte(answerJSON), &answer); err != nil {
					log.Printf("Failed to unmarshal answer: %v", err)
					continue
				}

				// DB에 저장
				if err := r.saveAnswerToDB(ctx, &answer); err != nil {
					log.Printf("Failed to save answer to DB: %v", err)
					// 실패한 답변을 다시 큐에 넣기 (재시도)
					r.redis.LPush(ctx, "quiz:answer_queue", answerJSON)
				}
			}
		}()
	})
}

// GetUserStats 사용자 통계 조회 (Redis 캐시 활용)
func (r *GormQuizRepository) GetUserStats(ctx context.Context, userID string) (*UserStats, error) {
	// 1. Redis 캐시 확인
	cacheKey := fmt.Sprintf("quiz:user_stats:%s", userID)
	cached := r.redis.Get(ctx, cacheKey).Val()
	
	if cached != "" {
		var stats UserStats
		if err := json.Unmarshal([]byte(cached), &stats); err == nil {
			return &stats, nil
		}
	}

	// 2. DB에서 조회
	var gormStats GormUserStats
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&gormStats).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("user stats not found: %s", userID)
		}
		return nil, fmt.Errorf("failed to get user stats: %w", err)
	}

	stats := gormStats.ToUserStats()

	// 3. Redis에 캐시 (5분 TTL)
	statsJSON, _ := json.Marshal(stats)
	r.redis.Set(ctx, cacheKey, statsJSON, 5*time.Minute)

	return stats, nil
}

// UpdateUserStats 사용자 통계 업데이트 (Redis 캐시 무효화)
func (r *GormQuizRepository) UpdateUserStats(ctx context.Context, stats *UserStats) error {
	var gormStats GormUserStats
	gormStats.FromUserStats(stats)

	err := r.db.WithContext(ctx).Where("user_id = ?", stats.UserID).Updates(&gormStats).Error
	if err != nil {
		return fmt.Errorf("failed to update user stats: %w", err)
	}

	// Redis 캐시 무효화
	cacheKey := fmt.Sprintf("quiz:user_stats:%s", stats.UserID)
	r.redis.Del(ctx, cacheKey)

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