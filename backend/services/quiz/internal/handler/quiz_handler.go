package handler

import (
	"context"

	pb "github.com/pawfiler/backend/services/quiz/pb"
	"github.com/pawfiler/backend/services/quiz/internal/service"
)

type QuizHandler struct {
	pb.UnimplementedQuizServiceServer
	service *service.QuizService
}

func NewQuizHandler(svc *service.QuizService) *QuizHandler {
	return &QuizHandler{service: svc}
}

func (h *QuizHandler) GetRandomQuestion(ctx context.Context, req *pb.GetRandomQuestionRequest) (*pb.QuizQuestion, error) {
	return h.service.GetRandomQuestion(ctx, req.UserId, req.Difficulty)
}

func (h *QuizHandler) SubmitAnswer(ctx context.Context, req *pb.SubmitAnswerRequest) (*pb.SubmitAnswerResponse, error) {
	return h.service.SubmitAnswer(ctx, req.UserId, req.QuestionId, req.SelectedIndex)
}

func (h *QuizHandler) GetUserStats(ctx context.Context, req *pb.GetUserStatsRequest) (*pb.QuizStats, error) {
	return h.service.GetUserStats(ctx, req.UserId)
}

func (h *QuizHandler) GetQuestionById(ctx context.Context, req *pb.GetQuestionByIdRequest) (*pb.QuizQuestion, error) {
	return h.service.GetQuestionById(ctx, req.QuestionId)
}
