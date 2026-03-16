package repository

import (
	"context"
	"errors"
)

// Common repository errors
var (
	ErrQuestionNotFound    = errors.New("question not found")
	ErrUserStatsNotFound   = errors.New("user stats not found")
	ErrUserProfileNotFound = errors.New("user profile not found")
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

	// GetUserProfile retrieves the gamification profile for a user.
	// Returns ErrUserProfileNotFound if no profile exists yet.
	GetUserProfile(ctx context.Context, userID string) (*UserProfile, error)

	// CreateUserProfile creates a new gamification profile with default values
	// (Energy=100, MaxEnergy=100, TotalExp=0, TotalCoins=0).
	CreateUserProfile(ctx context.Context, userID string) (*UserProfile, error)

	// UpdateUserProfile persists the current state of a UserProfile.
	UpdateUserProfile(ctx context.Context, profile *UserProfile) error

	// ApplyAnswerRewards atomically updates stats + profile in one transaction.
	// Returns updated stats (for streak info) and updated profile.
	ApplyAnswerRewards(ctx context.Context, userID string, isCorrect bool, xpDelta, coinDelta int32) (*UserStats, *UserProfile, error)
}