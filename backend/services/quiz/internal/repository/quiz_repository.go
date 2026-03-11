package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Common repository errors
var (
	ErrQuestionNotFound = errors.New("question not found")
	ErrUserStatsNotFound = errors.New("user stats not found")
)

// QuizRepository defines the interface for quiz data access operations
// Requirements: 3.1, 3.2, 3.3, 4.1, 9.1, 9.2, 9.3, 9.4, 12.1
type QuizRepository interface {
	// GetRandomQuestion retrieves a random question with optional filters
	// Requirements: 3.1, 3.2, 3.3
	GetRandomQuestion(ctx context.Context, difficulty *string, questionType *QuestionType) (*Question, error)

	// GetQuestionById retrieves a specific question by ID
	// Requirement: 4.1
	GetQuestionById(ctx context.Context, questionID string) (*Question, error)

	// SaveAnswer saves a user's answer to the database
	// Requirements: 9.1, 9.2, 9.3, 9.4
	SaveAnswer(ctx context.Context, answer *UserAnswer) error

	// GetUserStats retrieves user statistics
	// Requirement: 12.1
	GetUserStats(ctx context.Context, userID string) (*UserStats, error)

	// UpdateUserStats updates user statistics
	// Requirement: 11.1-11.8
	UpdateUserStats(ctx context.Context, stats *UserStats) error

	// CreateUserStats creates initial statistics for a new user
	// Requirement: 12.3
	CreateUserStats(ctx context.Context, userID string) (*UserStats, error)
}

// PostgresQuizRepository implements QuizRepository using PostgreSQL
type PostgresQuizRepository struct {
	db          *sql.DB
	questionIDs []string
	mu          sync.RWMutex
}

// NewPostgresQuizRepository creates a new PostgreSQL-based repository
func NewPostgresQuizRepository(db *sql.DB) QuizRepository {
	repo := &PostgresQuizRepository{db: db}
	
	// Load question IDs on startup
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	if err := repo.LoadQuestionIDs(ctx); err != nil {
		log.Printf("Warning: Failed to load question IDs: %v", err)
	}
	
	// Start auto-refresh every 5 minutes
	repo.StartAutoRefresh(5 * time.Minute)
	
	return repo
}

// LoadQuestionIDs loads all question IDs into memory for fast random selection
func (r *PostgresQuizRepository) LoadQuestionIDs(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, "SELECT id FROM quiz.questions")
	if err != nil {
		return fmt.Errorf("failed to query question IDs: %w", err)
	}
	defer rows.Close()
	
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("failed to scan question ID: %w", err)
		}
		ids = append(ids, id)
	}
	
	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating question IDs: %w", err)
	}
	
	r.mu.Lock()
	r.questionIDs = ids
	r.mu.Unlock()
	
	log.Printf("Loaded %d question IDs into cache", len(ids))
	return nil
}

// StartAutoRefresh starts a background goroutine to refresh question IDs periodically
func (r *PostgresQuizRepository) StartAutoRefresh(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := r.LoadQuestionIDs(ctx); err != nil {
				log.Printf("Auto-refresh failed: %v", err)
			}
			cancel()
		}
	}()
}

// GetRandomQuestion retrieves a random question with optional difficulty and type filters
// Requirements: 3.1, 3.2, 3.3
func (r *PostgresQuizRepository) GetRandomQuestion(ctx context.Context, difficulty *string, questionType *QuestionType) (*Question, error) {
	// If no filters, use cached IDs for fast random selection
	if difficulty == nil && questionType == nil {
		r.mu.RLock()
		if len(r.questionIDs) == 0 {
			r.mu.RUnlock()
			return nil, fmt.Errorf("no questions loaded in cache")
		}
		randomID := r.questionIDs[rand.Intn(len(r.questionIDs))]
		r.mu.RUnlock()
		
		return r.GetQuestionById(ctx, randomID)
	}
	
	// If filters are applied, use TABLESAMPLE for better performance
	query := `
		SELECT 
			id, type, media_type, media_url, thumbnail_emoji, 
			difficulty, category, explanation, created_at, updated_at,
			options, correct_index, correct_answer, correct_regions, 
			tolerance, comparison_media_url, correct_side
		FROM quiz.questions
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	// Apply difficulty filter (Requirement 3.2)
	if difficulty != nil {
		query += fmt.Sprintf(" AND difficulty = $%d", argCount)
		args = append(args, *difficulty)
		argCount++
	}

	// Apply question type filter (Requirement 3.3)
	if questionType != nil {
		query += fmt.Sprintf(" AND type = $%d", argCount)
		args = append(args, string(*questionType))
		argCount++
	}

	// Use TABLESAMPLE for filtered queries (Requirement 3.1)
	query += " ORDER BY RANDOM() LIMIT 1"

	var question Question
	var correctRegionsJSON []byte

	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&question.ID,
		&question.Type,
		&question.MediaType,
		&question.MediaURL,
		&question.ThumbnailEmoji,
		&question.Difficulty,
		&question.Category,
		&question.Explanation,
		&question.CreatedAt,
		&question.UpdatedAt,
		pq.Array(&question.Options),
		&question.CorrectIndex,
		&question.CorrectAnswer,
		&correctRegionsJSON,
		&question.Tolerance,
		&question.ComparisonMediaURL,
		&question.CorrectSide,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("no questions found matching criteria")
		}
		return nil, fmt.Errorf("failed to get random question: %w", err)
	}

	// Unmarshal correct_regions JSONB
	if correctRegionsJSON != nil {
		if err := json.Unmarshal(correctRegionsJSON, &question.CorrectRegions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal correct_regions: %w", err)
		}
	}

	return &question, nil
}

// GetQuestionById retrieves a specific question by its ID
// Requirement: 4.1
func (r *PostgresQuizRepository) GetQuestionById(ctx context.Context, questionID string) (*Question, error) {
	query := `
		SELECT 
			id, type, media_type, media_url, thumbnail_emoji, 
			difficulty, category, explanation, created_at, updated_at,
			options, correct_index, correct_answer, correct_regions, 
			tolerance, comparison_media_url, correct_side
		FROM quiz.questions
		WHERE id = $1
	`

	var question Question
	var correctRegionsJSON []byte

	err := r.db.QueryRowContext(ctx, query, questionID).Scan(
		&question.ID,
		&question.Type,
		&question.MediaType,
		&question.MediaURL,
		&question.ThumbnailEmoji,
		&question.Difficulty,
		&question.Category,
		&question.Explanation,
		&question.CreatedAt,
		&question.UpdatedAt,
		pq.Array(&question.Options),
		&question.CorrectIndex,
		&question.CorrectAnswer,
		&correctRegionsJSON,
		&question.Tolerance,
		&question.ComparisonMediaURL,
		&question.CorrectSide,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("question not found: %s", questionID)
		}
		return nil, fmt.Errorf("failed to get question by id: %w", err)
	}

	// Unmarshal correct_regions JSONB
	if correctRegionsJSON != nil {
		if err := json.Unmarshal(correctRegionsJSON, &question.CorrectRegions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal correct_regions: %w", err)
		}
	}

	return &question, nil
}

// SaveAnswer saves a user's answer to the database
// Requirements: 9.1, 9.2, 9.3, 9.4
func (r *PostgresQuizRepository) SaveAnswer(ctx context.Context, answer *UserAnswer) error {
	// Generate UUID if not provided
	if answer.ID == "" {
		answer.ID = uuid.New().String()
	}

	// Marshal answer_data to JSONB (Requirement 9.2)
	answerDataJSON, err := json.Marshal(answer.AnswerData)
	if err != nil {
		return fmt.Errorf("failed to marshal answer data: %w", err)
	}

	query := `
		INSERT INTO quiz.user_answers 
			(id, user_id, question_id, answer_data, is_correct, xp_earned, coins_earned, answered_at)
		VALUES 
			($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err = r.db.ExecContext(ctx, query,
		answer.ID,
		answer.UserID,
		answer.QuestionID,
		answerDataJSON,
		answer.IsCorrect,
		answer.XPEarned,    // Requirement 9.3
		answer.CoinsEarned, // Requirement 9.3
		answer.AnsweredAt,  // Requirement 9.4
	)

	if err != nil {
		return fmt.Errorf("failed to save answer: %w", err)
	}

	return nil
}

// GetUserStats retrieves user statistics from the database
// Requirement: 12.1
func (r *PostgresQuizRepository) GetUserStats(ctx context.Context, userID string) (*UserStats, error) {
	query := `
		SELECT 
			user_id, total_answered, correct_count, 
			current_streak, best_streak, lives, updated_at
		FROM quiz.user_stats
		WHERE user_id = $1
	`

	var stats UserStats
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&stats.UserID,
		&stats.TotalAnswered,
		&stats.CorrectCount,
		&stats.CurrentStreak,
		&stats.BestStreak,
		&stats.Lives,
		&stats.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("user stats not found: %s", userID)
		}
		return nil, fmt.Errorf("failed to get user stats: %w", err)
	}

	return &stats, nil
}

// UpdateUserStats updates user statistics in the database
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
func (r *PostgresQuizRepository) UpdateUserStats(ctx context.Context, stats *UserStats) error {
	query := `
		UPDATE quiz.user_stats
		SET 
			total_answered = $2,
			correct_count = $3,
			current_streak = $4,
			best_streak = $5,
			lives = $6,
			updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
	`

	result, err := r.db.ExecContext(ctx, query,
		stats.UserID,
		stats.TotalAnswered,
		stats.CorrectCount,
		stats.CurrentStreak,
		stats.BestStreak,
		stats.Lives,
	)

	if err != nil {
		return fmt.Errorf("failed to update user stats: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("user stats not found: %s", stats.UserID)
	}

	return nil
}

// CreateUserStats creates initial statistics for a new user
// Requirement: 12.3 - Default values: total_answered=0, correct_rate=0, current_streak=0, best_streak=0, lives=3
func (r *PostgresQuizRepository) CreateUserStats(ctx context.Context, userID string) (*UserStats, error) {
	query := `
		INSERT INTO quiz.user_stats 
			(user_id, total_answered, correct_count, current_streak, best_streak, lives)
		VALUES 
			($1, 0, 0, 0, 0, 3)
		RETURNING user_id, total_answered, correct_count, current_streak, best_streak, lives, updated_at
	`

	var stats UserStats
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&stats.UserID,
		&stats.TotalAnswered,
		&stats.CorrectCount,
		&stats.CurrentStreak,
		&stats.BestStreak,
		&stats.Lives,
		&stats.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create user stats: %w", err)
	}

	return &stats, nil
}

// NewQuizRepository creates a new QuizRepository instance (alias for NewPostgresQuizRepository)
func NewQuizRepository(db *sql.DB) QuizRepository {
	return NewPostgresQuizRepository(db)
}
