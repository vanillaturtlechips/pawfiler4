package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	pb "github.com/pawfiler/backend/services/quiz/proto"
	"github.com/pawfiler/backend/services/quiz/internal/repository"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockStatsTracker is a mock implementation of StatsTracker
type MockStatsTracker struct {
	mock.Mock
}

func (m *MockStatsTracker) UpdateStats(ctx context.Context, userID string, isCorrect bool) (*repository.UserStats, error) {
	args := m.Called(ctx, userID, isCorrect)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserStats), args.Error(1)
}

func (m *MockStatsTracker) GetStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.UserStats), args.Error(1)
}

// MockAnswerValidator is a mock implementation of AnswerValidator
type MockAnswerValidator struct {
	mock.Mock
}

func (m *MockAnswerValidator) ValidateMultipleChoice(selectedIndex int32, correctIndex int32, optionsCount int) (bool, error) {
	args := m.Called(selectedIndex, correctIndex, optionsCount)
	return args.Bool(0), args.Error(1)
}

func (m *MockAnswerValidator) ValidateTrueFalse(selectedAnswer bool, correctAnswer bool) bool {
	args := m.Called(selectedAnswer, correctAnswer)
	return args.Bool(0)
}

func (m *MockAnswerValidator) ValidateRegionSelect(selectedPoint repository.Point, correctRegions []repository.Region, tolerance int32) bool {
	args := m.Called(selectedPoint, correctRegions, tolerance)
	return args.Bool(0)
}

func (m *MockAnswerValidator) ValidateComparison(selectedSide string, correctSide string) (bool, error) {
	args := m.Called(selectedSide, correctSide)
	return args.Bool(0), args.Error(1)
}

// MockEventPublisher is a mock implementation of EventPublisher
type MockEventPublisher struct {
	mock.Mock
}

func (m *MockEventPublisher) PublishQuizAnswered(ctx context.Context, event *QuizAnsweredEvent) error {
	args := m.Called(ctx, event)
	return args.Error(0)
}

// TestGetRandomQuestion_Success tests successful random question retrieval
// Validates: Requirement 3.1
func TestGetRandomQuestion_Success(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	
	expectedQuestion := &repository.Question{
		ID:             "question-1",
		Type:           repository.QuestionTypeMultipleChoice,
		MediaType:      repository.MediaTypeImage,
		MediaURL:       "https://example.com/image.jpg",
		ThumbnailEmoji: "🤔",
		Difficulty:     repository.DifficultyEasy,
		Category:       "deepfake",
		Explanation:    "This is a test question",
		Options:        []string{"Option 1", "Option 2", "Option 3"},
		CorrectIndex:   sql.NullInt32{Int32: 0, Valid: true},
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	mockRepo.On("GetRandomQuestion", ctx, (*string)(nil), (*repository.QuestionType)(nil)).Return(expectedQuestion, nil)

	question, err := service.GetRandomQuestion(ctx, userID, nil, nil)

	assert.NoError(t, err)
	assert.NotNil(t, question)
	assert.Equal(t, expectedQuestion.ID, question.ID)
	assert.Equal(t, expectedQuestion.Type, question.Type)
	mockRepo.AssertExpectations(t)
}

// TestGetRandomQuestion_WithDifficulty tests random question retrieval with difficulty filter
// Validates: Requirement 3.2
func TestGetRandomQuestion_WithDifficulty(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	difficulty := "EASY"
	
	expectedQuestion := &repository.Question{
		ID:         "question-1",
		Type:       repository.QuestionTypeMultipleChoice,
		Difficulty: repository.DifficultyEasy,
	}

	mockRepo.On("GetRandomQuestion", ctx, &difficulty, (*repository.QuestionType)(nil)).Return(expectedQuestion, nil)

	question, err := service.GetRandomQuestion(ctx, userID, &difficulty, nil)

	assert.NoError(t, err)
	assert.NotNil(t, question)
	assert.Equal(t, repository.DifficultyEasy, question.Difficulty)
	mockRepo.AssertExpectations(t)
}

// TestGetRandomQuestion_WithType tests random question retrieval with type filter
// Validates: Requirement 3.3
func TestGetRandomQuestion_WithType(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	questionType := pb.QuestionType_TRUE_FALSE
	repoQuestionType := repository.QuestionTypeTrueFalse
	
	expectedQuestion := &repository.Question{
		ID:   "question-1",
		Type: repository.QuestionTypeTrueFalse,
	}

	mockRepo.On("GetRandomQuestion", ctx, (*string)(nil), &repoQuestionType).Return(expectedQuestion, nil)

	question, err := service.GetRandomQuestion(ctx, userID, nil, &questionType)

	assert.NoError(t, err)
	assert.NotNil(t, question)
	assert.Equal(t, repository.QuestionTypeTrueFalse, question.Type)
	mockRepo.AssertExpectations(t)
}

// TestGetQuestionById_Success tests successful question retrieval by ID
// Validates: Requirement 4.1
func TestGetQuestionById_Success(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	questionID := "question-123"
	
	expectedQuestion := &repository.Question{
		ID:             questionID,
		Type:           repository.QuestionTypeMultipleChoice,
		MediaType:      repository.MediaTypeImage,
		MediaURL:       "https://example.com/image.jpg",
		ThumbnailEmoji: "🤔",
		Difficulty:     repository.DifficultyEasy,
		Category:       "deepfake",
		Explanation:    "This is a test question",
	}

	mockRepo.On("GetQuestionById", ctx, questionID).Return(expectedQuestion, nil)

	question, err := service.GetQuestionById(ctx, questionID)

	assert.NoError(t, err)
	assert.NotNil(t, question)
	assert.Equal(t, questionID, question.ID)
	mockRepo.AssertExpectations(t)
}

// TestGetQuestionById_NotFound tests question retrieval with non-existent ID
// Validates: Requirement 4.3
func TestGetQuestionById_NotFound(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	questionID := "non-existent-id"

	mockRepo.On("GetQuestionById", ctx, questionID).Return(nil, errors.New("question not found"))

	question, err := service.GetQuestionById(ctx, questionID)

	assert.Error(t, err)
	assert.Nil(t, question)
	assert.Contains(t, err.Error(), "question not found")
	mockRepo.AssertExpectations(t)
}

// TestGetUserStats_ExistingUser tests user stats retrieval for existing user
// Validates: Requirement 12.1
func TestGetUserStats_ExistingUser(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	
	expectedStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 10,
		CorrectCount:  7,
		CurrentStreak: 3,
		BestStreak:    5,
		Lives:         3,
		UpdatedAt:     time.Now(),
	}

	mockStatsTracker.On("GetStats", ctx, userID).Return(expectedStats, nil)

	stats, err := service.GetUserStats(ctx, userID)

	assert.NoError(t, err)
	assert.NotNil(t, stats)
	assert.Equal(t, userID, stats.UserID)
	assert.Equal(t, int32(10), stats.TotalAnswered)
	assert.Equal(t, int32(7), stats.CorrectCount)
	assert.Equal(t, 0.7, stats.CorrectRate())
	mockStatsTracker.AssertExpectations(t)
}

// TestGetUserStats_NewUser tests user stats retrieval for new user with default values
// Validates: Requirement 12.3
func TestGetUserStats_NewUser(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "new-user-123"
	
	// StatsTracker returns default values for new users
	defaultStats := &repository.UserStats{
		UserID:        userID,
		TotalAnswered: 0,
		CorrectCount:  0,
		CurrentStreak: 0,
		BestStreak:    0,
		Lives:         3,
	}

	mockStatsTracker.On("GetStats", ctx, userID).Return(defaultStats, nil)

	stats, err := service.GetUserStats(ctx, userID)

	assert.NoError(t, err)
	assert.NotNil(t, stats)
	assert.Equal(t, userID, stats.UserID)
	assert.Equal(t, int32(0), stats.TotalAnswered)
	assert.Equal(t, int32(0), stats.CorrectCount)
	assert.Equal(t, int32(0), stats.CurrentStreak)
	assert.Equal(t, int32(0), stats.BestStreak)
	assert.Equal(t, int32(3), stats.Lives)
	assert.Equal(t, 0.0, stats.CorrectRate())
	mockStatsTracker.AssertExpectations(t)
}

// TestConvertProtoToRepoQuestionType tests question type conversion
func TestConvertProtoToRepoQuestionType(t *testing.T) {
	tests := []struct {
		name      string
		protoType pb.QuestionType
		expected  repository.QuestionType
	}{
		{
			name:      "Multiple Choice",
			protoType: pb.QuestionType_MULTIPLE_CHOICE,
			expected:  repository.QuestionTypeMultipleChoice,
		},
		{
			name:      "True False",
			protoType: pb.QuestionType_TRUE_FALSE,
			expected:  repository.QuestionTypeTrueFalse,
		},
		{
			name:      "Region Select",
			protoType: pb.QuestionType_REGION_SELECT,
			expected:  repository.QuestionTypeRegionSelect,
		},
		{
			name:      "Comparison",
			protoType: pb.QuestionType_COMPARISON,
			expected:  repository.QuestionTypeComparison,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertProtoToRepoQuestionType(tt.protoType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestSubmitAnswer_MultipleChoice_Correct tests submitting a correct multiple choice answer
// Validates: Requirements 5.1, 5.2, 9.1, 9.3, 10.1, 10.2, 11.1, 11.2, 11.3, 13.1
func TestSubmitAnswer_MultipleChoice_Correct(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:           questionID,
		Type:         repository.QuestionTypeMultipleChoice,
		Options:      []string{"Option 1", "Option 2", "Option 3"},
		CorrectIndex: sql.NullInt32{Int32: 1, Valid: true},
		Explanation:  "This is the explanation",
	}

	answer := repository.MultipleChoiceAnswer{SelectedIndex: 1}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateMultipleChoice", int32(1), int32(1), 3).Return(true, nil)
	mockRepo.On("SaveAnswer", ctx, mock.MatchedBy(func(ua *repository.UserAnswer) bool {
		return ua.UserID == userID &&
			ua.QuestionID == questionID &&
			ua.IsCorrect == true &&
			ua.XPEarned == 10 &&
			ua.CoinsEarned == 5
	})).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, true).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.MatchedBy(func(e *QuizAnsweredEvent) bool {
		return e.UserID == userID &&
			e.QuestionID == questionID &&
			e.Correct == true &&
			e.XPEarned == 10 &&
			e.CoinsEarned == 5
	})).Return(nil)

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.IsCorrect)
	assert.Equal(t, int32(10), result.XPEarned)
	assert.Equal(t, int32(5), result.CoinsEarned)
	assert.Equal(t, "This is the explanation", result.Explanation)
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
	mockStatsTracker.AssertExpectations(t)
	mockEventPublisher.AssertExpectations(t)
}

// TestSubmitAnswer_MultipleChoice_Incorrect tests submitting an incorrect multiple choice answer
// Validates: Requirements 5.3, 10.3, 11.4, 11.5
func TestSubmitAnswer_MultipleChoice_Incorrect(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:           questionID,
		Type:         repository.QuestionTypeMultipleChoice,
		Options:      []string{"Option 1", "Option 2", "Option 3"},
		CorrectIndex: sql.NullInt32{Int32: 1, Valid: true},
		Explanation:  "This is the explanation",
	}

	answer := repository.MultipleChoiceAnswer{SelectedIndex: 0}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateMultipleChoice", int32(0), int32(1), 3).Return(false, nil)
	mockRepo.On("SaveAnswer", ctx, mock.MatchedBy(func(ua *repository.UserAnswer) bool {
		return ua.UserID == userID &&
			ua.QuestionID == questionID &&
			ua.IsCorrect == false &&
			ua.XPEarned == 0 &&
			ua.CoinsEarned == 0
	})).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, false).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.MatchedBy(func(e *QuizAnsweredEvent) bool {
		return e.UserID == userID &&
			e.QuestionID == questionID &&
			e.Correct == false &&
			e.XPEarned == 0 &&
			e.CoinsEarned == 0
	})).Return(nil)

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.False(t, result.IsCorrect)
	assert.Equal(t, int32(0), result.XPEarned)
	assert.Equal(t, int32(0), result.CoinsEarned)
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
	mockStatsTracker.AssertExpectations(t)
	mockEventPublisher.AssertExpectations(t)
}

// TestSubmitAnswer_TrueFalse tests submitting a true/false answer
// Validates: Requirements 6.1, 6.2
func TestSubmitAnswer_TrueFalse(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:            questionID,
		Type:          repository.QuestionTypeTrueFalse,
		CorrectAnswer: sql.NullBool{Bool: true, Valid: true},
		Explanation:   "This is the explanation",
	}

	answer := repository.TrueFalseAnswer{SelectedAnswer: true}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateTrueFalse", true, true).Return(true)
	mockRepo.On("SaveAnswer", ctx, mock.AnythingOfType("*repository.UserAnswer")).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, true).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.AnythingOfType("*service.QuizAnsweredEvent")).Return(nil)

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.IsCorrect)
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
}

// TestSubmitAnswer_RegionSelect tests submitting a region select answer
// Validates: Requirements 7.1, 7.2, 7.3
func TestSubmitAnswer_RegionSelect(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:   questionID,
		Type: repository.QuestionTypeRegionSelect,
		CorrectRegions: []repository.Region{
			{X: 100, Y: 100, Radius: 50},
		},
		Tolerance:   sql.NullInt32{Int32: 10, Valid: true},
		Explanation: "This is the explanation",
	}

	answer := repository.RegionSelectAnswer{
		SelectedRegion: repository.Point{X: 110, Y: 110},
	}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateRegionSelect", 
		repository.Point{X: 110, Y: 110}, 
		question.CorrectRegions, 
		int32(10)).Return(true)
	mockRepo.On("SaveAnswer", ctx, mock.AnythingOfType("*repository.UserAnswer")).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, true).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.AnythingOfType("*service.QuizAnsweredEvent")).Return(nil)

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.IsCorrect)
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
}

// TestSubmitAnswer_Comparison tests submitting a comparison answer
// Validates: Requirements 8.1, 8.2
func TestSubmitAnswer_Comparison(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:          questionID,
		Type:        repository.QuestionTypeComparison,
		CorrectSide: sql.NullString{String: "left", Valid: true},
		Explanation: "This is the explanation",
	}

	answer := repository.ComparisonAnswer{SelectedSide: "left"}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateComparison", "left", "left").Return(true, nil)
	mockRepo.On("SaveAnswer", ctx, mock.AnythingOfType("*repository.UserAnswer")).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, true).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.AnythingOfType("*service.QuizAnsweredEvent")).Return(nil)

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.IsCorrect)
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
}

// TestSubmitAnswer_QuestionNotFound tests submitting answer for non-existent question
// Validates: Requirement 15.1
func TestSubmitAnswer_QuestionNotFound(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	questionID := "non-existent"

	answer := repository.MultipleChoiceAnswer{SelectedIndex: 0}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(nil, errors.New("question not found"))

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "question not found")
	mockRepo.AssertExpectations(t)
}

// TestSubmitAnswer_InvalidIndex tests submitting answer with invalid index
// Validates: Requirement 5.4, 15.2
func TestSubmitAnswer_InvalidIndex(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.Background()
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:           questionID,
		Type:         repository.QuestionTypeMultipleChoice,
		Options:      []string{"Option 1", "Option 2", "Option 3"},
		CorrectIndex: sql.NullInt32{Int32: 1, Valid: true},
	}

	answer := repository.MultipleChoiceAnswer{SelectedIndex: 10}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateMultipleChoice", int32(10), int32(1), 3).Return(false, errors.New("selected_index 10 is out of range"))

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert
	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "invalid answer")
	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
}

// TestSubmitAnswer_EventPublishFailure tests that answer processing succeeds even if event publishing fails
// Validates: Requirement 13.4
func TestSubmitAnswer_EventPublishFailure(t *testing.T) {
	mockRepo := new(MockQuizRepository)
	mockStatsTracker := new(MockStatsTracker)
	mockValidator := new(MockAnswerValidator)
	mockEventPublisher := new(MockEventPublisher)
	service := NewQuizService(mockRepo, mockStatsTracker, mockValidator, mockEventPublisher)

	ctx := context.WithValue(context.Background(), "timestamp", time.Now())
	userID := "user-123"
	questionID := "question-1"

	question := &repository.Question{
		ID:           questionID,
		Type:         repository.QuestionTypeMultipleChoice,
		Options:      []string{"Option 1", "Option 2"},
		CorrectIndex: sql.NullInt32{Int32: 0, Valid: true},
		Explanation:  "Explanation",
	}

	answer := repository.MultipleChoiceAnswer{SelectedIndex: 0}

	// Mock expectations
	mockRepo.On("GetQuestionById", ctx, questionID).Return(question, nil)
	mockValidator.On("ValidateMultipleChoice", int32(0), int32(0), 2).Return(true, nil)
	mockRepo.On("SaveAnswer", ctx, mock.AnythingOfType("*repository.UserAnswer")).Return(nil)
	mockStatsTracker.On("UpdateStats", ctx, userID, true).Return(&repository.UserStats{}, nil)
	mockEventPublisher.On("PublishQuizAnswered", ctx, mock.AnythingOfType("*service.QuizAnsweredEvent")).Return(errors.New("kafka connection failed"))

	// Execute
	result, err := service.SubmitAnswer(ctx, userID, questionID, answer)

	// Assert - should succeed despite event publishing failure
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.IsCorrect)
	mockRepo.AssertExpectations(t)
	mockEventPublisher.AssertExpectations(t)
}
