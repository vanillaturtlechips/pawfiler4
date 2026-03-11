package service

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pawfiler/backend/services/quiz/internal/repository"
)

// StatsTracker defines the interface for tracking and managing user quiz statistics
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.1, 12.3, 12.4
type StatsTracker interface {
	// UpdateStats updates user statistics based on whether the answer was correct
	// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
	UpdateStats(ctx context.Context, userID string, isCorrect bool) (*repository.UserStats, error)

	// GetStats retrieves user statistics, returning default values for new users
	// Requirements: 12.1, 12.3, 12.4
	GetStats(ctx context.Context, userID string) (*repository.UserStats, error)
}

// statsTrackerImpl implements the StatsTracker interface
type statsTrackerImpl struct {
	repo repository.QuizRepository
}

// NewStatsTracker creates a new StatsTracker instance
func NewStatsTracker(repo repository.QuizRepository) StatsTracker {
	return &statsTrackerImpl{
		repo: repo,
	}
}

// UpdateStats updates user statistics based on correct/incorrect answer
// This method ensures data consistency through GORM transaction processing
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
func (s *statsTrackerImpl) UpdateStats(ctx context.Context, userID string, isCorrect bool) (*repository.UserStats, error) {
	// Get current stats or create new ones
	stats, err := s.repo.GetUserStats(ctx, userID)
	if err != nil {
		// If user stats don't exist, create them (Requirement 12.3)
		stats, err = s.repo.CreateUserStats(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("failed to create user stats: %w", err)
		}
	}

	// Requirement 11.1: Increment total_answered
	stats.TotalAnswered++

	if isCorrect {
		// Requirement 11.2: Increment correct_count on correct answer
		stats.CorrectCount++

		// Requirement 11.3: Increment current_streak on correct answer
		stats.CurrentStreak++

		// Requirement 11.6: Update best_streak if current_streak exceeds it
		if stats.CurrentStreak > stats.BestStreak {
			stats.BestStreak = stats.CurrentStreak
		}
	} else {
		// Requirement 11.4: Reset current_streak to 0 on incorrect answer
		stats.CurrentStreak = 0

		// Requirement 11.5: Decrease lives by 1 on incorrect answer
		stats.Lives--
	}

	// Update stats in database (GORM handles transactions internally)
	err = s.repo.UpdateUserStats(ctx, stats)
	if err != nil {
		return nil, fmt.Errorf("failed to update user stats: %w", err)
	}

	// Requirement 11.7: correct_rate is calculated via CorrectRate() method
	return stats, nil
}

// GetStats retrieves user statistics with default values for new users
// Requirements: 12.1, 12.3, 12.4
func (s *statsTrackerImpl) GetStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	// Requirement 12.1: Query user_stats table
	stats, err := s.repo.GetUserStats(ctx, userID)
	if err != nil {
		// Requirement 12.3: Return default values for new users
		// (total_answered=0, correct_rate=0, current_streak=0, best_streak=0, lives=3)
		return &repository.UserStats{
			UserID:        userID,
			TotalAnswered: 0,
			CorrectCount:  0,
			CurrentStreak: 0,
			BestStreak:    0,
			Lives:         3,
		}, nil
	}

	// Requirement 12.4: correct_rate is returned as 0-1 decimal via CorrectRate() method
	return stats, nil
}
