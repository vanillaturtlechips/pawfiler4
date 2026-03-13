package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	pb "github.com/pawfiler/backend/services/quiz/proto"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// QuizService defines the interface for quiz business logic operations
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 12.1, 12.2, 12.3, 12.4
type QuizService interface {
	// GetRandomQuestion retrieves a random question with optional filters
	// Returns question without answer information (Requirements 3.5, 3.6, 3.7, 3.8)
	// Requirements: 3.1, 3.2, 3.3, 3.4
	GetRandomQuestion(ctx context.Context, userID string, difficulty *string, questionType *pb.QuestionType) (*repository.Question, error)

	// GetQuestionById retrieves a specific question by ID
	// Returns question without answer information (Requirement 4.4)
	// Returns NOT_FOUND error if question doesn't exist (Requirement 4.3)
	// Requirements: 4.1, 4.2, 4.3, 4.4
	GetQuestionById(ctx context.Context, questionID string) (*repository.Question, error)

	// SubmitAnswer validates and processes a user's answer submission
	// Requirements: 5.1~5.4, 6.1~6.3, 7.1~7.5, 8.1~8.4, 9.1~9.4, 10.1~10.4, 11.1~11.8, 13.1~13.4, 15.1~15.5
	SubmitAnswer(ctx context.Context, userID string, questionID string, answer repository.Answer) (*SubmitResult, error)

	// GetUserStats retrieves user statistics
	// Returns default values for new users (Requirement 12.3)
	// Requirements: 12.1, 12.2, 12.3, 12.4
	GetUserStats(ctx context.Context, userID string) (*repository.UserStats, error)

	// GetUserProfile retrieves gamification profile (level, XP, coins, energy)
	GetUserProfile(ctx context.Context, userID string) (*repository.UserProfile, error)
	
	// UpdateUserProfile updates gamification profile
	UpdateUserProfile(ctx context.Context, profile *repository.UserProfile) error
}

// SubmitResult represents the result of a submitted answer
type SubmitResult struct {
	IsCorrect   bool
	XPEarned    int32
	CoinsEarned int32
	Explanation string
}

// quizServiceImpl implements the QuizService interface
type quizServiceImpl struct {
	repo         repository.QuizRepository
	statsTracker StatsTracker
	validator    AnswerValidator
}

// NewQuizService creates a new QuizService instance
func NewQuizService(repo repository.QuizRepository, statsTracker StatsTracker, validator AnswerValidator) QuizService {
	return &quizServiceImpl{
		repo:         repo,
		statsTracker: statsTracker,
		validator:    validator,
	}
}

// GetRandomQuestion retrieves a random question with optional filters
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
func (s *quizServiceImpl) GetRandomQuestion(ctx context.Context, userID string, difficulty *string, questionType *pb.QuestionType) (*repository.Question, error) {
	// Convert protobuf QuestionType to repository QuestionType
	var repoQuestionType *repository.QuestionType
	if questionType != nil {
		converted := convertProtoToRepoQuestionType(*questionType)
		repoQuestionType = &converted
	}

	// Energy check: get or create profile, refill, then deduct 5
	profile, err := s.repo.GetUserProfile(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserProfileNotFound) {
			profile, err = s.repo.CreateUserProfile(ctx, userID)
			if err != nil {
				return nil, fmt.Errorf("failed to create user profile: %w", err)
			}
		} else {
			return nil, fmt.Errorf("failed to get user profile: %w", err)
		}
	}
	profile.RefillEnergy()
	if profile.Energy < 5 {
		return nil, status.Errorf(codes.ResourceExhausted, "insufficient_energy:%d", profile.Energy)
	}
	profile.Energy -= 5
	if err := s.repo.UpdateUserProfile(ctx, profile); err != nil {
		return nil, fmt.Errorf("failed to update energy: %w", err)
	}

	// Requirement 3.1: Retrieve random question from database
	question, err := s.repo.GetRandomQuestion(ctx, difficulty, repoQuestionType)
	if err != nil {
		return nil, fmt.Errorf("failed to get random question: %w", err)
	}

	return question, nil
}

// GetQuestionById retrieves a specific question by ID
// Requirements: 4.1, 4.2, 4.3, 4.4
func (s *quizServiceImpl) GetQuestionById(ctx context.Context, questionID string) (*repository.Question, error) {
	// Requirement 4.1: Query database with provided question_id
	question, err := s.repo.GetQuestionById(ctx, questionID)
	if err != nil {
		// Requirement 4.3: Return NOT_FOUND error if question doesn't exist
		return nil, fmt.Errorf("question not found: %w", err)
	}

	// Requirement 4.2: Return question as QuizQuestion message (handled by handler layer)
	// Requirement 4.4: Answer information is excluded when converting to protobuf
	return question, nil
}

// GetUserStats retrieves user statistics
// Requirements: 12.1, 12.2, 12.3, 12.4
func (s *quizServiceImpl) GetUserStats(ctx context.Context, userID string) (*repository.UserStats, error) {
	// Requirement 12.1: Query quiz.user_stats table with provided user_id
	// Requirement 12.3: Return default values if user stats don't exist
	stats, err := s.statsTracker.GetStats(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user stats: %w", err)
	}

	// Requirement 12.2: Return as QuizStats message (handled by handler layer)
	// Requirement 12.4: correct_rate is returned as 0-1 decimal (calculated by CorrectRate() method)
	return stats, nil
}

// GetUserProfile retrieves gamification profile, creating one if it doesn't exist
func (s *quizServiceImpl) GetUserProfile(ctx context.Context, userID string) (*repository.UserProfile, error) {
	profile, err := s.repo.GetUserProfile(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserProfileNotFound) {
			return s.repo.CreateUserProfile(ctx, userID)
		}
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}
	profile.RefillEnergy()
	return profile, nil
}

func (s *quizServiceImpl) UpdateUserProfile(ctx context.Context, profile *repository.UserProfile) error {
	return s.repo.UpdateUserProfile(ctx, profile)
}

// convertProtoToRepoQuestionType converts protobuf QuestionType to repository QuestionType
func convertProtoToRepoQuestionType(protoType pb.QuestionType) repository.QuestionType {
	switch protoType {
	case pb.QuestionType_MULTIPLE_CHOICE:
		return repository.QuestionTypeMultipleChoice
	case pb.QuestionType_TRUE_FALSE:
		return repository.QuestionTypeTrueFalse
	case pb.QuestionType_REGION_SELECT:
		return repository.QuestionTypeRegionSelect
	case pb.QuestionType_COMPARISON:
		return repository.QuestionTypeComparison
	default:
		return repository.QuestionTypeMultipleChoice
	}
}

// SubmitAnswer validates and processes a user's answer submission
// This method orchestrates the entire answer submission flow:
// 1. Retrieve question and validate answer
// 2. Calculate rewards
// 3. Save answer to database
// 4. Update user statistics
// 5. Return result
// Requirements: 5.1~5.4, 6.1~6.3, 7.1~7.5, 8.1~8.4, 9.1~9.4, 10.1~10.4, 11.1~11.8, 13.1~13.4, 15.1~15.5
func (s *quizServiceImpl) SubmitAnswer(ctx context.Context, userID string, questionID string, answer repository.Answer) (*SubmitResult, error) {
	// Step 1: Get the question by ID
	question, err := s.repo.GetQuestionById(ctx, questionID)
	if err != nil {
		// Requirement 15.1: Return NOT_FOUND if question doesn't exist
		return nil, fmt.Errorf("question not found: %w", err)
	}

	// Step 2: Validate answer based on question type
	var isCorrect bool
	var validationErr error

	switch question.Type {
	case repository.QuestionTypeMultipleChoice:
		// Requirements 5.1, 5.2, 5.3, 5.4: Validate multiple choice answer
		mcAnswer, ok := answer.(repository.MultipleChoiceAnswer)
		if !ok {
			// Requirement 15.2: Return INVALID_ARGUMENT for wrong answer type
			return nil, fmt.Errorf("invalid answer type for multiple choice question")
		}
		isCorrect, validationErr = s.validator.ValidateMultipleChoice(
			mcAnswer.SelectedIndex,
			question.CorrectIndex.Int32,
			len(question.Options),
		)
		if validationErr != nil {
			// Requirement 15.2: Return INVALID_ARGUMENT for validation errors
			return nil, fmt.Errorf("invalid answer: %w", validationErr)
		}

	case repository.QuestionTypeTrueFalse:
		// Requirements 6.1, 6.2, 6.3: Validate true/false answer
		tfAnswer, ok := answer.(repository.TrueFalseAnswer)
		if !ok {
			return nil, fmt.Errorf("invalid answer type for true/false question")
		}
		isCorrect = s.validator.ValidateTrueFalse(
			tfAnswer.SelectedAnswer,
			question.CorrectAnswer.Bool,
		)

	case repository.QuestionTypeRegionSelect:
		// Requirements 7.1, 7.2, 7.3, 7.4, 7.5: Validate region select answer
		rsAnswer, ok := answer.(repository.RegionSelectAnswer)
		if !ok {
			return nil, fmt.Errorf("invalid answer type for region select question")
		}
		isCorrect = s.validator.ValidateRegionSelect(
			rsAnswer.SelectedRegion,
			question.CorrectRegions,
			int32(question.Tolerance.Int32),
		)

	case repository.QuestionTypeComparison:
		// Requirements 8.1, 8.2, 8.3, 8.4: Validate comparison answer
		compAnswer, ok := answer.(repository.ComparisonAnswer)
		if !ok {
			return nil, fmt.Errorf("invalid answer type for comparison question")
		}
		isCorrect, validationErr = s.validator.ValidateComparison(
			compAnswer.SelectedSide,
			question.CorrectSide.String,
		)
		if validationErr != nil {
			// Requirement 15.2: Return INVALID_ARGUMENT for validation errors
			return nil, fmt.Errorf("invalid answer: %w", validationErr)
		}

	default:
		return nil, fmt.Errorf("unsupported question type: %s", question.Type)
	}

	// Step 3: Calculate rewards based on difficulty
	var xpEarned, coinsEarned int32
	if isCorrect {
		xpEarned, coinsEarned = repository.XPRewardByDifficulty(question.Difficulty)
	}

	// Step 4: Save answer to database
	// Requirements 9.1, 9.2, 9.3, 9.4: Save answer with all required fields
	answerData, err := answer.ToJSON()
	if err != nil {
		// Requirement 15.3: Return INTERNAL for database errors
		return nil, fmt.Errorf("failed to convert answer to JSON: %w", err)
	}

	// Get timestamp from context or use current time
	answeredAt := time.Now()
	if ts := ctx.Value("timestamp"); ts != nil {
		if timestamp, ok := ts.(time.Time); ok {
			answeredAt = timestamp
		}
	}

	userAnswer := &repository.UserAnswer{
		UserID:      userID,
		QuestionID:  questionID,
		AnswerData:  answerData,
		IsCorrect:   isCorrect,
		XPEarned:    xpEarned,
		CoinsEarned: coinsEarned,
		AnsweredAt:  answeredAt, // Requirement 9.4
	}

	err = s.repo.SaveAnswer(context.Background(), userAnswer)
	if err != nil {
		// Requirement 15.3: Return INTERNAL for database errors
		return nil, fmt.Errorf("failed to save answer: %w", err)
	}

	// Step 5: Update user statistics
	_, err = s.statsTracker.UpdateStats(context.Background(), userID, isCorrect)
	if err != nil {
		fmt.Printf("Warning: failed to update user stats: %v\n", err)
	}

	// Step 5b: Update gamification profile (XP + coins)
	if xpEarned > 0 || coinsEarned > 0 {
		profile, err := s.repo.GetUserProfile(context.Background(), userID)
		if err != nil {
			if errors.Is(err, repository.ErrUserProfileNotFound) {
				profile, _ = s.repo.CreateUserProfile(context.Background(), userID)
			}
		}
		if profile != nil {
			profile.TotalExp += xpEarned
			profile.TotalCoins += coinsEarned
			
			// 티어 승급 체크 및 XP 리셋
			tier := profile.Tier()
			exp := profile.TotalExp
			
			switch tier {
			case "알":
				if exp >= 10 {
					profile.CurrentTier = "삐약이"
					profile.TotalExp = exp - 10
				}
			case "삐약이":
				if exp >= 100 {
					profile.CurrentTier = "맹금닭"
					profile.TotalExp = exp - 100
				}
			case "맹금닭":
				if exp >= 1000 {
					profile.CurrentTier = "불사조"
					profile.TotalExp = exp - 1000
				}
			}
			
			if err := s.repo.UpdateUserProfile(context.Background(), profile); err != nil {
				fmt.Printf("Warning: failed to update user profile: %v\n", err)
			}
		}
	}

	// Step 6: Return result
	// Requirement 10.4: Include xp_earned and coins_earned in response
	return &SubmitResult{
		IsCorrect:   isCorrect,
		XPEarned:    xpEarned,
		CoinsEarned: coinsEarned,
		Explanation: question.Explanation,
	}, nil
}
