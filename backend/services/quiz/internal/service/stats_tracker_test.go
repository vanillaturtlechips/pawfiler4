package service

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/pawfiler/backend/services/quiz/internal/repository"
)

// MockQuizRepository is a mock implementation of QuizRepository
type MockQuizRepository struct {
	mock.Mock
}

func (m *MockQuizRepository) GetRandomQuestion(ctx context.Context, userID string, difficulty *string, questionType *repository.QuestionType) (*repository.Question, error) {
	args := m.Called(ctx, userID, difficulty, questionType)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.Question), args.Error(1)
}

func (m *MockQuizRepository) GetQuestionById(ctx context.Context, questionID string) (*repository.Question, error) {
	args := m.Called(ctx, questionID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.Question), args.Error(1)
}

func (m *MockQuizRepository) SaveAnswer(ctx context.Context, answer *repository.UserAnswer) error {
	args := m.Called(ctx, answer)
	return args.Error(0)
}

func (m *MockQuizRepository) GetUserStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserStats), args.Error(1)
}

func (m *MockQuizRepository) UpdateUserStats(ctx context.Context, stats *repository.UserStats) error {
	args := m.Called(ctx, stats)
	return args.Error(0)
}

func (m *MockQuizRepository) CreateUserStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserStats), args.Error(1)
}

func (m *MockQuizRepository) GetUserProfile(ctx context.Context, userID string) (*repository.UserProfile, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserProfile), args.Error(1)
}

func (m *MockQuizRepository) UpdateUserProfile(ctx context.Context, profile *repository.UserProfile) error {
	args := m.Called(ctx, profile)
	return args.Error(0)
}

func (m *MockQuizRepository) AddProfileRewards(ctx context.Context, userID string, xpDelta, coinsDelta int32) (*repository.UserProfile, error) {
	args := m.Called(ctx, userID, xpDelta, coinsDelta)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserProfile), args.Error(1)
}

func (m *MockQuizRepository) DeductEnergy(ctx context.Context, userID string, amount int32) (*repository.UserProfile, error) {
	args := m.Called(ctx, userID, amount)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserProfile), args.Error(1)
}

// Test UpdateStats with correct answer
func TestUpdateStats_CorrectAnswer(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, dbMock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "user-123"

	// Mock transaction
	dbMock.ExpectBegin()

	// Mock existing stats
	existingStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 10,
		CorrectCount:  7,
		CurrentStreak: 2,
		BestStreak:    5,
		Lives:         3,
	}
	mockRepo.On("GetUserStats", ctx, userID).Return(existingStats, nil)

	// Mock update
	mockRepo.On("UpdateUserStats", ctx, mock.MatchedBy(func(stats *repository.UserStats) bool {
		return stats.UserID == userID &&
			stats.TotalAnswered == 11 &&
			stats.CorrectCount == 8 &&
			stats.CurrentStreak == 3 &&
			stats.BestStreak == 5 &&
			stats.Lives == 3
	})).Return(nil)

	dbMock.ExpectCommit()

	// Execute
	result, err := tracker.UpdateStats(ctx, userID, true)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, int32(11), result.TotalAnswered)
	assert.Equal(t, int32(8), result.CorrectCount)
	assert.Equal(t, int32(3), result.CurrentStreak)
	assert.Equal(t, int32(5), result.BestStreak)
	assert.Equal(t, int32(3), result.Lives)

	mockRepo.AssertExpectations(t)
	assert.NoError(t, dbMock.ExpectationsWereMet())
}

// Test UpdateStats with incorrect answer
func TestUpdateStats_IncorrectAnswer(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, dbMock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "user-456"

	// Mock transaction
	dbMock.ExpectBegin()

	// Mock existing stats
	existingStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 15,
		CorrectCount:  10,
		CurrentStreak: 3,
		BestStreak:    5,
		Lives:         2,
	}
	mockRepo.On("GetUserStats", ctx, userID).Return(existingStats, nil)

	// Mock update
	mockRepo.On("UpdateUserStats", ctx, mock.MatchedBy(func(stats *repository.UserStats) bool {
		return stats.UserID == userID &&
			stats.TotalAnswered == 16 &&
			stats.CorrectCount == 10 &&
			stats.CurrentStreak == 0 &&
			stats.BestStreak == 5 &&
			stats.Lives == 1
	})).Return(nil)

	dbMock.ExpectCommit()

	// Execute
	result, err := tracker.UpdateStats(ctx, userID, false)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, int32(16), result.TotalAnswered)
	assert.Equal(t, int32(10), result.CorrectCount)
	assert.Equal(t, int32(0), result.CurrentStreak)
	assert.Equal(t, int32(5), result.BestStreak)
	assert.Equal(t, int32(1), result.Lives)

	mockRepo.AssertExpectations(t)
	assert.NoError(t, dbMock.ExpectationsWereMet())
}

// Test UpdateStats updates best_streak when current_streak exceeds it
func TestUpdateStats_UpdateBestStreak(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, dbMock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "user-789"

	// Mock transaction
	dbMock.ExpectBegin()

	// Mock existing stats where current_streak will exceed best_streak
	existingStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 20,
		CorrectCount:  15,
		CurrentStreak: 5,
		BestStreak:    5,
		Lives:         3,
	}
	mockRepo.On("GetUserStats", ctx, userID).Return(existingStats, nil)

	// Mock update - best_streak should be updated to 6
	mockRepo.On("UpdateUserStats", ctx, mock.MatchedBy(func(stats *repository.UserStats) bool {
		return stats.UserID == userID &&
			stats.TotalAnswered == 21 &&
			stats.CorrectCount == 16 &&
			stats.CurrentStreak == 6 &&
			stats.BestStreak == 6 &&
			stats.Lives == 3
	})).Return(nil)

	dbMock.ExpectCommit()

	// Execute
	result, err := tracker.UpdateStats(ctx, userID, true)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, int32(6), result.CurrentStreak)
	assert.Equal(t, int32(6), result.BestStreak)

	mockRepo.AssertExpectations(t)
	assert.NoError(t, dbMock.ExpectationsWereMet())
}

// Test UpdateStats creates new stats for new user
func TestUpdateStats_NewUser(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, dbMock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "new-user"

	// Mock transaction
	dbMock.ExpectBegin()

	// Mock GetUserStats returns error (user not found)
	mockRepo.On("GetUserStats", ctx, userID).Return(nil, errors.New("user stats not found"))

	// Mock CreateUserStats
	newStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 0,
		CorrectCount:  0,
		CurrentStreak: 0,
		BestStreak:    0,
		Lives:         3,
	}
	mockRepo.On("CreateUserStats", ctx, userID).Return(newStats, nil)

	// Mock update
	mockRepo.On("UpdateUserStats", ctx, mock.MatchedBy(func(stats *repository.UserStats) bool {
		return stats.UserID == userID &&
			stats.TotalAnswered == 1 &&
			stats.CorrectCount == 1 &&
			stats.CurrentStreak == 1 &&
			stats.BestStreak == 1 &&
			stats.Lives == 3
	})).Return(nil)

	dbMock.ExpectCommit()

	// Execute
	result, err := tracker.UpdateStats(ctx, userID, true)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, int32(1), result.TotalAnswered)
	assert.Equal(t, int32(1), result.CorrectCount)
	assert.Equal(t, int32(1), result.CurrentStreak)
	assert.Equal(t, int32(1), result.BestStreak)

	mockRepo.AssertExpectations(t)
	assert.NoError(t, dbMock.ExpectationsWereMet())
}

// Test GetStats returns existing stats
func TestGetStats_ExistingUser(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, _, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "user-123"

	// Mock existing stats
	existingStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 50,
		CorrectCount:  35,
		CurrentStreak: 5,
		BestStreak:    10,
		Lives:         2,
	}
	mockRepo.On("GetUserStats", ctx, userID).Return(existingStats, nil)

	// Execute
	result, err := tracker.GetStats(ctx, userID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, userID, result.UserID)
	assert.Equal(t, int32(50), result.TotalAnswered)
	assert.Equal(t, int32(35), result.CorrectCount)
	assert.Equal(t, int32(5), result.CurrentStreak)
	assert.Equal(t, int32(10), result.BestStreak)
	assert.Equal(t, int32(2), result.Lives)

	mockRepo.AssertExpectations(t)
}

// Test GetStats returns default values for new user
func TestGetStats_NewUser(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	db, _, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	tracker := NewStatsTracker(mockRepo, db)
	ctx := context.Background()
	userID := "new-user"

	// Mock GetUserStats returns error (user not found)
	mockRepo.On("GetUserStats", ctx, userID).Return(nil, errors.New("user stats not found"))

	// Execute
	result, err := tracker.GetStats(ctx, userID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, userID, result.UserID)
	assert.Equal(t, int32(0), result.TotalAnswered)
	assert.Equal(t, int32(0), result.CorrectCount)
	assert.Equal(t, int32(0), result.CurrentStreak)
	assert.Equal(t, int32(0), result.BestStreak)
	assert.Equal(t, int32(3), result.Lives)

	// Verify correct_rate is 0.0 for new user
	assert.Equal(t, 0.0, result.CorrectRate())

	mockRepo.AssertExpectations(t)
}

// Test CorrectRate calculation
func TestCorrectRate_Calculation(t *testing.T) {
	tests := []struct {
		name          string
		totalAnswered int32
		correctCount  int32
		expectedRate  float64
	}{
		{
			name:          "Zero answers",
			totalAnswered: 0,
			correctCount:  0,
			expectedRate:  0.0,
		},
		{
			name:          "Perfect score",
			totalAnswered: 10,
			correctCount:  10,
			expectedRate:  1.0,
		},
		{
			name:          "Half correct",
			totalAnswered: 20,
			correctCount:  10,
			expectedRate:  0.5,
		},
		{
			name:          "70% correct",
			totalAnswered: 100,
			correctCount:  70,
			expectedRate:  0.7,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := &repository.UserStats{
				TotalAnswered: tt.totalAnswered,
				CorrectCount:  tt.correctCount,
			}

			rate := stats.CorrectRate()
			assert.InDelta(t, tt.expectedRate, rate, 0.0001)
		})
	}
}
