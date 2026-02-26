package service

import (
	"context"
	"fmt"

	pb "github.com/pawfiler/backend/services/quiz/pb"
	"github.com/pawfiler/backend/services/quiz/internal/repository"
	"github.com/pawfiler/backend/services/quiz/pkg/kafka"
)

type QuizService struct {
	repo     *repository.QuizRepository
	producer *kafka.Producer
}

func NewQuizService(repo *repository.QuizRepository, producer *kafka.Producer) *QuizService {
	return &QuizService{
		repo:     repo,
		producer: producer,
	}
}

func (s *QuizService) GetRandomQuestion(ctx context.Context, userID string, difficulty *string) (*pb.QuizQuestion, error) {
	return s.repo.GetRandomQuestion(ctx, difficulty)
}

func (s *QuizService) SubmitAnswer(ctx context.Context, userID, questionID string, selectedIndex int32) (*pb.SubmitAnswerResponse, error) {
	question, err := s.repo.GetQuestionById(ctx, questionID)
	if err != nil {
		return nil, err
	}

	correct := question.CorrectIndex == selectedIndex
	xpEarned := int32(0)
	coinsEarned := int32(0)

	if correct {
		xpEarned = 10
		coinsEarned = 5
	}

	err = s.repo.SaveAnswer(ctx, userID, questionID, selectedIndex, correct, xpEarned, coinsEarned)
	if err != nil {
		return nil, err
	}

	stats, err := s.repo.UpdateStats(ctx, userID, correct)
	if err != nil {
		return nil, err
	}

	// Emit event
	s.producer.Emit("quiz.answered", map[string]interface{}{
		"user_id":      userID,
		"question_id":  questionID,
		"correct":      correct,
		"xp_earned":    xpEarned,
		"coins_earned": coinsEarned,
	})

	return &pb.SubmitAnswerResponse{
		Correct:      correct,
		XpEarned:     xpEarned,
		CoinsEarned:  coinsEarned,
		Explanation:  question.Explanation,
		StreakCount:  stats.CurrentStreak,
	}, nil
}

func (s *QuizService) GetUserStats(ctx context.Context, userID string) (*pb.QuizStats, error) {
	return s.repo.GetUserStats(ctx, userID)
}

func (s *QuizService) GetQuestionById(ctx context.Context, questionID string) (*pb.QuizQuestion, error) {
	return s.repo.GetQuestionById(ctx, questionID)
}
