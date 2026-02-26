package handler

import (
	"context"
	"errors"
	"testing"

	pb "quiz-service/proto"
	"quiz-service/internal/repository"
	"quiz-service/internal/service"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// MockQuizService is a mock implementation of QuizService for testing
type MockQuizService struct {
	GetRandomQuestionFunc func(ctx context.Context, userID string, difficulty *string, questionType *pb.QuestionType) (*repository.Question, error)
	GetQuestionByIdFunc   func(ctx context.Context, questionID string) (*repository.Question, error)
	SubmitAnswerFunc      func(ctx context.Context, userID string, questionID string, answer repository.Answer) (*service.SubmitResult, error)
	GetUserStatsFunc      func(ctx context.Context, userID string) (*repository.UserStats, error)
}

func (m *MockQuizService) GetRandomQuestion(ctx context.Context, userID string, difficulty *string, questionType *pb.QuestionType) (*repository.Question, error) {
	if m.GetRandomQuestionFunc != nil {
		return m.GetRandomQuestionFunc(ctx, userID, difficulty, questionType)
	}
	return nil, errors.New("not implemented")
}

func (m *MockQuizService) GetQuestionById(ctx context.Context, questionID string) (*repository.Question, error) {
	if m.GetQuestionByIdFunc != nil {
		return m.GetQuestionByIdFunc(ctx, questionID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockQuizService) SubmitAnswer(ctx context.Context, userID string, questionID string, answer repository.Answer) (*service.SubmitResult, error) {
	if m.SubmitAnswerFunc != nil {
		return m.SubmitAnswerFunc(ctx, userID, questionID, answer)
	}
	return nil, errors.New("not implemented")
}

func (m *MockQuizService) GetUserStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	if m.GetUserStatsFunc != nil {
		return m.GetUserStatsFunc(ctx, userID)
	}
	return nil, errors.New("not implemented")
}

// TestGetRandomQuestion_Success tests successful random question retrieval
func TestGetRandomQuestion_Success(t *testing.T) {
	mockService := &MockQuizService{
		GetRandomQuestionFunc: func(ctx context.Context, userID string, difficulty *string, questionType *pb.QuestionType) (*repository.Question, error) {
			return &repository.Question{
				ID:             "test-id",
				Type:           repository.QuestionTypeMultipleChoice,
				MediaType:      repository.MediaTypeVideo,
				MediaURL:       "http://example.com/video.mp4",
				ThumbnailEmoji: "🎥",
				Difficulty:     repository.DifficultyEasy,
				Category:       "deepfake",
				Explanation:    "Test explanation",
				Options:        []string{"Option 1", "Option 2", "Option 3"},
			}, nil
		},
	}

	handler := NewQuizHandler(mockService)
	req := &pb.GetRandomQuestionRequest{
		UserId: "user-123",
	}

	resp, err := handler.GetRandomQuestion(context.Background(), req)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if resp.Id != "test-id" {
		t.Errorf("Expected ID 'test-id', got: %s", resp.Id)
	}

	if resp.Type != pb.QuestionType_MULTIPLE_CHOICE {
		t.Errorf("Expected type MULTIPLE_CHOICE, got: %v", resp.Type)
	}

	// Verify answer information is not included
	if resp.CorrectIndex != nil {
		t.Error("Expected CorrectIndex to be nil (answer info should be excluded)")
	}
}

// TestGetQuestionById_NotFound tests NOT_FOUND error handling
func TestGetQuestionById_NotFound(t *testing.T) {
	mockService := &MockQuizService{
		GetQuestionByIdFunc: func(ctx context.Context, questionID string) (*repository.Question, error) {
			return nil, repository.ErrQuestionNotFound
		},
	}

	handler := NewQuizHandler(mockService)
	req := &pb.GetQuestionByIdRequest{
		QuestionId: "non-existent-id",
	}

	_, err := handler.GetQuestionById(context.Background(), req)

	if err == nil {
		t.Fatal("Expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("Expected gRPC status error")
	}

	if st.Code() != codes.NotFound {
		t.Errorf("Expected NOT_FOUND status code, got: %v", st.Code())
	}
}

// TestSubmitAnswer_MultipleChoice tests multiple choice answer submission
func TestSubmitAnswer_MultipleChoice(t *testing.T) {
	mockService := &MockQuizService{
		SubmitAnswerFunc: func(ctx context.Context, userID string, questionID string, answer repository.Answer) (*service.SubmitResult, error) {
			return &service.SubmitResult{
				IsCorrect:   true,
				XPEarned:    10,
				CoinsEarned: 5,
				Explanation: "Correct!",
			}, nil
		},
		GetUserStatsFunc: func(ctx context.Context, userID string) (*repository.UserStats, error) {
			return &repository.UserStats{
				UserID:        userID,
				TotalAnswered: 1,
				CorrectCount:  1,
				CurrentStreak: 1,
				BestStreak:    1,
				Lives:         3,
			}, nil
		},
	}

	handler := NewQuizHandler(mockService)
	selectedIndex := int32(0)
	req := &pb.SubmitAnswerRequest{
		UserId:        "user-123",
		QuestionId:    "question-123",
		SelectedIndex: &selectedIndex,
	}

	resp, err := handler.SubmitAnswer(context.Background(), req)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if !resp.Correct {
		t.Error("Expected correct answer")
	}

	if resp.XpEarned != 10 {
		t.Errorf("Expected 10 XP, got: %d", resp.XpEarned)
	}

	if resp.CoinsEarned != 5 {
		t.Errorf("Expected 5 coins, got: %d", resp.CoinsEarned)
	}

	if resp.StreakCount != 1 {
		t.Errorf("Expected streak count 1, got: %d", resp.StreakCount)
	}
}

// TestSubmitAnswer_InvalidArgument tests INVALID_ARGUMENT error handling
func TestSubmitAnswer_InvalidArgument(t *testing.T) {
	mockService := &MockQuizService{}

	handler := NewQuizHandler(mockService)
	req := &pb.SubmitAnswerRequest{
		UserId:     "user-123",
		QuestionId: "question-123",
		// No answer provided
	}

	_, err := handler.SubmitAnswer(context.Background(), req)

	if err == nil {
		t.Fatal("Expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("Expected gRPC status error")
	}

	if st.Code() != codes.InvalidArgument {
		t.Errorf("Expected INVALID_ARGUMENT status code, got: %v", st.Code())
	}
}

// TestGetUserStats_Success tests successful user stats retrieval
func TestGetUserStats_Success(t *testing.T) {
	mockService := &MockQuizService{
		GetUserStatsFunc: func(ctx context.Context, userID string) (*repository.UserStats, error) {
			return &repository.UserStats{
				UserID:        userID,
				TotalAnswered: 10,
				CorrectCount:  7,
				CurrentStreak: 3,
				BestStreak:    5,
				Lives:         2,
			}, nil
		},
	}

	handler := NewQuizHandler(mockService)
	req := &pb.GetUserStatsRequest{
		UserId: "user-123",
	}

	resp, err := handler.GetUserStats(context.Background(), req)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if resp.TotalAnswered != 10 {
		t.Errorf("Expected 10 total answered, got: %d", resp.TotalAnswered)
	}

	expectedRate := 0.7
	if resp.CorrectRate < expectedRate-0.01 || resp.CorrectRate > expectedRate+0.01 {
		t.Errorf("Expected correct rate ~0.7, got: %f", resp.CorrectRate)
	}

	if resp.CurrentStreak != 3 {
		t.Errorf("Expected current streak 3, got: %d", resp.CurrentStreak)
	}

	if resp.BestStreak != 5 {
		t.Errorf("Expected best streak 5, got: %d", resp.BestStreak)
	}

	if resp.Lives != 2 {
		t.Errorf("Expected 2 lives, got: %d", resp.Lives)
	}
}

// TestConvertQuestionToProto_ExcludesAnswers tests that answer info is excluded
func TestConvertQuestionToProto_ExcludesAnswers(t *testing.T) {
	// Test Multiple Choice
	mcQuestion := &repository.Question{
		ID:        "mc-id",
		Type:      repository.QuestionTypeMultipleChoice,
		MediaType: repository.MediaTypeVideo,
		Options:   []string{"A", "B", "C"},
	}
	mcQuestion.CorrectIndex.Int32 = 1
	mcQuestion.CorrectIndex.Valid = true

	pbMC := convertQuestionToProto(mcQuestion, false)
	if pbMC.CorrectIndex != nil {
		t.Error("Expected CorrectIndex to be nil when includeAnswers=false")
	}

	// Test True/False
	tfQuestion := &repository.Question{
		ID:        "tf-id",
		Type:      repository.QuestionTypeTrueFalse,
		MediaType: repository.MediaTypeImage,
	}
	tfQuestion.CorrectAnswer.Bool = true
	tfQuestion.CorrectAnswer.Valid = true

	pbTF := convertQuestionToProto(tfQuestion, false)
	if pbTF.CorrectAnswer != nil {
		t.Error("Expected CorrectAnswer to be nil when includeAnswers=false")
	}

	// Test Comparison
	compQuestion := &repository.Question{
		ID:        "comp-id",
		Type:      repository.QuestionTypeComparison,
		MediaType: repository.MediaTypeVideo,
	}
	compQuestion.CorrectSide.String = "left"
	compQuestion.CorrectSide.Valid = true

	pbComp := convertQuestionToProto(compQuestion, false)
	if pbComp.CorrectSide != nil {
		t.Error("Expected CorrectSide to be nil when includeAnswers=false")
	}
}

// TestConvertProtoToAnswer tests answer conversion from protobuf
func TestConvertProtoToAnswer(t *testing.T) {
	// Test Multiple Choice
	selectedIndex := int32(2)
	mcReq := &pb.SubmitAnswerRequest{
		SelectedIndex: &selectedIndex,
	}
	mcAnswer, err := convertProtoToAnswer(mcReq)
	if err != nil {
		t.Fatalf("Expected no error for multiple choice, got: %v", err)
	}
	if _, ok := mcAnswer.(repository.MultipleChoiceAnswer); !ok {
		t.Error("Expected MultipleChoiceAnswer type")
	}

	// Test True/False
	selectedAnswer := true
	tfReq := &pb.SubmitAnswerRequest{
		SelectedAnswer: &selectedAnswer,
	}
	tfAnswer, err := convertProtoToAnswer(tfReq)
	if err != nil {
		t.Fatalf("Expected no error for true/false, got: %v", err)
	}
	if _, ok := tfAnswer.(repository.TrueFalseAnswer); !ok {
		t.Error("Expected TrueFalseAnswer type")
	}

	// Test Region Select
	rsReq := &pb.SubmitAnswerRequest{
		SelectedRegion: &pb.Point{X: 100, Y: 200},
	}
	rsAnswer, err := convertProtoToAnswer(rsReq)
	if err != nil {
		t.Fatalf("Expected no error for region select, got: %v", err)
	}
	if _, ok := rsAnswer.(repository.RegionSelectAnswer); !ok {
		t.Error("Expected RegionSelectAnswer type")
	}

	// Test Comparison
	selectedSide := "left"
	compReq := &pb.SubmitAnswerRequest{
		SelectedSide: &selectedSide,
	}
	compAnswer, err := convertProtoToAnswer(compReq)
	if err != nil {
		t.Fatalf("Expected no error for comparison, got: %v", err)
	}
	if _, ok := compAnswer.(repository.ComparisonAnswer); !ok {
		t.Error("Expected ComparisonAnswer type")
	}

	// Test no answer provided
	emptyReq := &pb.SubmitAnswerRequest{}
	_, err = convertProtoToAnswer(emptyReq)
	if err == nil {
		t.Error("Expected error when no answer provided")
	}
}
