package handler

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "quiz-service/proto"
	"quiz-service/internal/repository"
	"quiz-service/internal/service"
)

// QuizHandler implements the gRPC QuizService server
// It receives RPC requests, calls the service layer, and converts responses to protobuf messages
// Requirements: 3.1~3.8, 4.1~4.4, 12.1~12.4, 15.1~15.5
type QuizHandler struct {
	pb.UnimplementedQuizServiceServer
	service service.QuizService
}

// NewQuizHandler creates a new QuizHandler instance
func NewQuizHandler(svc service.QuizService) *QuizHandler {
	return &QuizHandler{
		service: svc,
	}
}

// GetRandomQuestion handles the GetRandomQuestion RPC
// Requirements: 3.1~3.8
func (h *QuizHandler) GetRandomQuestion(ctx context.Context, req *pb.GetRandomQuestionRequest) (*pb.QuizQuestion, error) {
	// Extract optional filters
	var difficulty *string
	if req.Difficulty != nil {
		difficulty = req.Difficulty
	}

	var questionType *pb.QuestionType
	if req.Type != nil {
		questionType = req.Type
	}

	// Call service layer
	question, err := h.service.GetRandomQuestion(ctx, req.UserId, difficulty, questionType)
	if err != nil {
		// Requirement 15.3: Map database errors to INTERNAL
		return nil, status.Error(codes.Internal, "failed to get random question")
	}

	// Convert to protobuf and exclude answer information (Requirements 3.5, 3.6, 3.7, 3.8)
	pbQuestion := convertQuestionToProto(question, false)
	return pbQuestion, nil
}

// GetQuestionById handles the GetQuestionById RPC
// Requirements: 4.1~4.4
func (h *QuizHandler) GetQuestionById(ctx context.Context, req *pb.GetQuestionByIdRequest) (*pb.QuizQuestion, error) {
	// Call service layer
	question, err := h.service.GetQuestionById(ctx, req.QuestionId)
	if err != nil {
		// Requirement 4.3, 15.1: Return NOT_FOUND if question doesn't exist
		if errors.Is(err, repository.ErrQuestionNotFound) || isNotFoundError(err) {
			return nil, status.Error(codes.NotFound, "question not found")
		}
		// Requirement 15.3: Map other errors to INTERNAL
		return nil, status.Error(codes.Internal, "failed to get question")
	}

	// Requirement 4.4: Convert to protobuf and exclude answer information
	pbQuestion := convertQuestionToProto(question, false)
	return pbQuestion, nil
}

// SubmitAnswer handles the SubmitAnswer RPC
// Requirements: 5.1~5.4, 6.1~6.3, 7.1~7.5, 8.1~8.4, 9.1~9.4, 10.1~10.4, 11.1~11.8, 13.1~13.4, 15.1~15.5
func (h *QuizHandler) SubmitAnswer(ctx context.Context, req *pb.SubmitAnswerRequest) (*pb.SubmitAnswerResponse, error) {
	// Convert protobuf answer to repository answer type
	answer, err := convertProtoToAnswer(req)
	if err != nil {
		// Requirement 15.2: Return INVALID_ARGUMENT for invalid input
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// Call service layer
	result, err := h.service.SubmitAnswer(ctx, req.UserId, req.QuestionId, answer)
	if err != nil {
		// Map errors to appropriate gRPC status codes
		return nil, mapServiceError(err)
	}

	// Get updated stats to include streak count in response
	stats, err := h.service.GetUserStats(ctx, req.UserId)
	if err != nil {
		// Log warning but don't fail the request
		fmt.Printf("Warning: failed to get user stats after answer submission: %v\n", err)
		stats = &repository.UserStats{CurrentStreak: 0}
	}

	// Requirement 10.4: Return result with xp_earned and coins_earned
	return &pb.SubmitAnswerResponse{
		Correct:     result.IsCorrect,
		XpEarned:    result.XPEarned,
		CoinsEarned: result.CoinsEarned,
		Explanation: result.Explanation,
		StreakCount: stats.CurrentStreak,
	}, nil
}

// GetUserStats handles the GetUserStats RPC
// Requirements: 12.1~12.4
func (h *QuizHandler) GetUserStats(ctx context.Context, req *pb.GetUserStatsRequest) (*pb.QuizStats, error) {
	// Call service layer
	stats, err := h.service.GetUserStats(ctx, req.UserId)
	if err != nil {
		// Requirement 15.3: Map database errors to INTERNAL
		return nil, status.Error(codes.Internal, "failed to get user stats")
	}

	// Requirement 12.4: Convert to protobuf with correct_rate as 0-1 decimal
	return &pb.QuizStats{
		TotalAnswered: stats.TotalAnswered,
		CorrectRate:   stats.CorrectRate(), // Returns 0-1 decimal
		CurrentStreak: stats.CurrentStreak,
		BestStreak:    stats.BestStreak,
		Lives:         stats.Lives,
	}, nil
}

// convertQuestionToProto converts a repository Question to protobuf QuizQuestion
// includeAnswers parameter controls whether to include answer information (Requirements 3.5, 3.6, 3.7, 3.8)
func convertQuestionToProto(q *repository.Question, includeAnswers bool) *pb.QuizQuestion {
	pbQuestion := &pb.QuizQuestion{
		Id:             q.ID,
		Type:           convertRepoToProtoQuestionType(q.Type),
		MediaType:      convertRepoToProtoMediaType(q.MediaType),
		MediaUrl:       q.MediaURL,
		ThumbnailEmoji: q.ThumbnailEmoji,
		Difficulty:     string(q.Difficulty),
		Category:       q.Category,
		Explanation:    q.Explanation,
	}

	// Add type-specific fields based on question type
	switch q.Type {
	case repository.QuestionTypeMultipleChoice:
		pbQuestion.Options = q.Options
		// Requirement 3.5: Only include correct_index if includeAnswers is true
		if includeAnswers && q.CorrectIndex.Valid {
			pbQuestion.CorrectIndex = &q.CorrectIndex.Int32
		}

	case repository.QuestionTypeTrueFalse:
		// Requirement 3.6: Only include correct_answer if includeAnswers is true
		if includeAnswers && q.CorrectAnswer.Valid {
			pbQuestion.CorrectAnswer = &q.CorrectAnswer.Bool
		}

	case repository.QuestionTypeRegionSelect:
		// Requirement 3.7: Only include correct_regions if includeAnswers is true
		if includeAnswers {
			pbQuestion.CorrectRegions = convertRegionsToProto(q.CorrectRegions)
		}
		if q.Tolerance.Valid {
			pbQuestion.Tolerance = &q.Tolerance.Int32
		}

	case repository.QuestionTypeComparison:
		if q.ComparisonMediaURL.Valid {
			pbQuestion.ComparisonMediaUrl = &q.ComparisonMediaURL.String
		}
		// Requirement 3.8: Only include correct_side if includeAnswers is true
		if includeAnswers && q.CorrectSide.Valid {
			pbQuestion.CorrectSide = &q.CorrectSide.String
		}
	}

	return pbQuestion
}

// convertProtoToAnswer converts protobuf answer fields to repository Answer interface
func convertProtoToAnswer(req *pb.SubmitAnswerRequest) (repository.Answer, error) {
	// Determine answer type based on which field is set
	if req.SelectedIndex != nil {
		return repository.MultipleChoiceAnswer{
			SelectedIndex: *req.SelectedIndex,
		}, nil
	}

	if req.SelectedAnswer != nil {
		return repository.TrueFalseAnswer{
			SelectedAnswer: *req.SelectedAnswer,
		}, nil
	}

	if req.SelectedRegion != nil {
		return repository.RegionSelectAnswer{
			SelectedRegion: repository.Point{
				X: req.SelectedRegion.X,
				Y: req.SelectedRegion.Y,
			},
		}, nil
	}

	if req.SelectedSide != nil {
		return repository.ComparisonAnswer{
			SelectedSide: *req.SelectedSide,
		}, nil
	}

	return nil, errors.New("no answer provided")
}

// convertRepoToProtoQuestionType converts repository QuestionType to protobuf QuestionType
func convertRepoToProtoQuestionType(repoType repository.QuestionType) pb.QuestionType {
	switch repoType {
	case repository.QuestionTypeMultipleChoice:
		return pb.QuestionType_MULTIPLE_CHOICE
	case repository.QuestionTypeTrueFalse:
		return pb.QuestionType_TRUE_FALSE
	case repository.QuestionTypeRegionSelect:
		return pb.QuestionType_REGION_SELECT
	case repository.QuestionTypeComparison:
		return pb.QuestionType_COMPARISON
	default:
		return pb.QuestionType_MULTIPLE_CHOICE
	}
}

// convertRepoToProtoMediaType converts repository MediaType to protobuf MediaType
func convertRepoToProtoMediaType(repoType repository.MediaType) pb.MediaType {
	switch repoType {
	case repository.MediaTypeVideo:
		return pb.MediaType_VIDEO
	case repository.MediaTypeImage:
		return pb.MediaType_IMAGE
	default:
		return pb.MediaType_VIDEO
	}
}

// convertRegionsToProto converts repository Regions to protobuf Regions
func convertRegionsToProto(regions []repository.Region) []*pb.Region {
	pbRegions := make([]*pb.Region, len(regions))
	for i, r := range regions {
		pbRegions[i] = &pb.Region{
			X:      r.X,
			Y:      r.Y,
			Radius: r.Radius,
		}
	}
	return pbRegions
}

// mapServiceError maps service layer errors to appropriate gRPC status codes
// Requirements: 15.1, 15.2, 15.3, 15.5
func mapServiceError(err error) error {
	if err == nil {
		return nil
	}

	errMsg := err.Error()

	// Requirement 15.1: NOT_FOUND for missing resources
	if errors.Is(err, repository.ErrQuestionNotFound) || isNotFoundError(err) {
		return status.Error(codes.NotFound, "question not found")
	}

	// Requirement 15.2: INVALID_ARGUMENT for validation errors
	if isValidationError(err) {
		// Requirement 15.5: Don't expose sensitive information
		return status.Error(codes.InvalidArgument, sanitizeErrorMessage(errMsg))
	}

	// Requirement 15.3: INTERNAL for database and other errors
	// Requirement 15.5: Don't expose sensitive information (stack traces, database details)
	return status.Error(codes.Internal, "internal server error")
}

// isNotFoundError checks if an error indicates a resource was not found
func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := err.Error()
	return errors.Is(err, repository.ErrQuestionNotFound) ||
		containsAny(errMsg, []string{"not found", "does not exist", "no rows"})
}

// isValidationError checks if an error is a validation error
func isValidationError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := err.Error()
	return containsAny(errMsg, []string{
		"invalid",
		"out of range",
		"must be",
		"validation",
		"selected_index",
		"selected_side",
	})
}

// sanitizeErrorMessage removes sensitive information from error messages
// Requirement 15.5: Don't expose stack traces or database details
func sanitizeErrorMessage(msg string) string {
	// Remove common sensitive patterns
	if containsAny(msg, []string{"database", "sql", "postgres", "connection"}) {
		return "invalid request"
	}
	// Return the message if it doesn't contain sensitive info
	return msg
}

// containsAny checks if a string contains any of the given substrings
func containsAny(s string, substrs []string) bool {
	for _, substr := range substrs {
		if len(s) >= len(substr) {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
		}
	}
	return false
}
