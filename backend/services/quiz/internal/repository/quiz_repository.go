package repository

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/lib/pq"
	pb "github.com/pawfiler/backend/services/quiz/pb"
)

type QuizRepository struct {
	db *sql.DB
}

func NewQuizRepository(db *sql.DB) *QuizRepository {
	return &QuizRepository{db: db}
}

func (r *QuizRepository) GetRandomQuestion(ctx context.Context, difficulty *string) (*pb.QuizQuestion, error) {
	query := `SELECT id, video_url, thumbnail_emoji, options, correct_index, explanation, difficulty 
	          FROM quiz.questions`
	
	if difficulty != nil && *difficulty != "" {
		query += ` WHERE difficulty = $1`
	}
	query += ` ORDER BY RANDOM() LIMIT 1`

	var q pb.QuizQuestion
	var options pq.StringArray

	var err error
	if difficulty != nil && *difficulty != "" {
		err = r.db.QueryRowContext(ctx, query, *difficulty).Scan(
			&q.Id, &q.VideoUrl, &q.ThumbnailEmoji, &options, &q.CorrectIndex, &q.Explanation, &q.Difficulty,
		)
	} else {
		err = r.db.QueryRowContext(ctx, query).Scan(
			&q.Id, &q.VideoUrl, &q.ThumbnailEmoji, &options, &q.CorrectIndex, &q.Explanation, &q.Difficulty,
		)
	}

	if err != nil {
		return nil, err
	}

	q.Options = options
	return &q, nil
}

func (r *QuizRepository) GetQuestionById(ctx context.Context, questionID string) (*pb.QuizQuestion, error) {
	query := `SELECT id, video_url, thumbnail_emoji, options, correct_index, explanation, difficulty 
	          FROM quiz.questions WHERE id = $1`

	var q pb.QuizQuestion
	var options pq.StringArray

	err := r.db.QueryRowContext(ctx, query, questionID).Scan(
		&q.Id, &q.VideoUrl, &q.ThumbnailEmoji, &options, &q.CorrectIndex, &q.Explanation, &q.Difficulty,
	)
	if err != nil {
		return nil, err
	}

	q.Options = options
	return &q, nil
}

func (r *QuizRepository) SaveAnswer(ctx context.Context, userID, questionID string, selectedIndex int32, correct bool, xp, coins int32) error {
	query := `INSERT INTO quiz.user_answers (user_id, question_id, selected_index, is_correct, xp_earned, coins_earned)
	          VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.db.ExecContext(ctx, query, userID, questionID, selectedIndex, correct, xp, coins)
	return err
}

func (r *QuizRepository) UpdateStats(ctx context.Context, userID string, correct bool) (*pb.QuizStats, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var stats pb.QuizStats
	query := `SELECT total_answered, correct_count, current_streak, best_streak, lives 
	          FROM quiz.user_stats WHERE user_id = $1 FOR UPDATE`
	
	err = tx.QueryRowContext(ctx, query, userID).Scan(
		&stats.TotalAnswered, &stats.CorrectRate, &stats.CurrentStreak, &stats.BestStreak, &stats.Lives,
	)

	if err == sql.ErrNoRows {
		stats = pb.QuizStats{TotalAnswered: 0, CorrectRate: 0, CurrentStreak: 0, BestStreak: 0, Lives: 3}
	} else if err != nil {
		return nil, err
	}

	stats.TotalAnswered++
	if correct {
		stats.CurrentStreak++
		if stats.CurrentStreak > stats.BestStreak {
			stats.BestStreak = stats.CurrentStreak
		}
	} else {
		stats.CurrentStreak = 0
		stats.Lives--
	}

	correctCount := int32(float64(stats.TotalAnswered) * stats.CorrectRate)
	if correct {
		correctCount++
	}
	stats.CorrectRate = float64(correctCount) / float64(stats.TotalAnswered)

	upsertQuery := `INSERT INTO quiz.user_stats (user_id, total_answered, correct_count, current_streak, best_streak, lives)
	                VALUES ($1, $2, $3, $4, $5, $6)
	                ON CONFLICT (user_id) DO UPDATE SET
	                total_answered = $2, correct_count = $3, current_streak = $4, best_streak = $5, lives = $6`
	
	_, err = tx.ExecContext(ctx, upsertQuery, userID, stats.TotalAnswered, correctCount, stats.CurrentStreak, stats.BestStreak, stats.Lives)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	return &stats, nil
}

func (r *QuizRepository) GetUserStats(ctx context.Context, userID string) (*pb.QuizStats, error) {
	query := `SELECT total_answered, correct_count, current_streak, best_streak, lives 
	          FROM quiz.user_stats WHERE user_id = $1`

	var stats pb.QuizStats
	var correctCount int32

	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&stats.TotalAnswered, &correctCount, &stats.CurrentStreak, &stats.BestStreak, &stats.Lives,
	)

	if err == sql.ErrNoRows {
		return &pb.QuizStats{TotalAnswered: 0, CorrectRate: 0, CurrentStreak: 0, BestStreak: 0, Lives: 3}, nil
	}
	if err != nil {
		return nil, err
	}

	if stats.TotalAnswered > 0 {
		stats.CorrectRate = float64(correctCount) / float64(stats.TotalAnswered)
	}

	return &stats, nil
}
