package service

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/google/uuid"

	"github.com/pawfiler/backend/services/admin/internal/repository"
)

type QuizAdminService struct {
	repo             *repository.QuizRepository
	s3Client         *s3.S3
	s3Bucket         string
	s3Region         string
	cloudfrontDomain string
}

func NewQuizAdminService(repo *repository.QuizRepository) *QuizAdminService {
	// Initialize S3 client
	sess := session.Must(session.NewSession(&aws.Config{
		Region: aws.String(getEnv("AWS_REGION", "ap-northeast-2")),
	}))

	return &QuizAdminService{
		repo:             repo,
		s3Client:         s3.New(sess),
		s3Bucket:         getEnv("S3_BUCKET", "pawfiler-quiz-media"),
		s3Region:         getEnv("AWS_REGION", "ap-northeast-2"),
		cloudfrontDomain: getEnv("CLOUDFRONT_DOMAIN", ""),
	}
}

func (s *QuizAdminService) ListQuestions(page, pageSize int) ([]repository.Question, int, error) {
	offset := (page - 1) * pageSize
	return s.repo.ListQuestions(pageSize, offset)
}

func (s *QuizAdminService) GetQuestion(id string) (*repository.Question, error) {
	return s.repo.GetQuestion(id)
}

func (s *QuizAdminService) CreateQuestion(req *repository.CreateQuestionRequest) (*repository.Question, error) {
	// Validate request
	if err := s.validateQuestionRequest(req); err != nil {
		return nil, err
	}

	return s.repo.CreateQuestion(req)
}

func (s *QuizAdminService) UpdateQuestion(id string, req *repository.CreateQuestionRequest) (*repository.Question, error) {
	// Validate request
	if err := s.validateQuestionRequest(req); err != nil {
		return nil, err
	}

	return s.repo.UpdateQuestion(id, req)
}

func (s *QuizAdminService) DeleteQuestion(id string) error {
	return s.repo.DeleteQuestion(id)
}

func (s *QuizAdminService) UploadMedia(file io.Reader, filename, category, mediaType, difficulty string) (string, error) {
	// Generate UUID for filename
	id := uuid.New().String()
	ext := filepath.Ext(filename)
	
	// New S3 key format: {category}/{media_type}/{difficulty}/{uuid}.{ext}
	s3Key := fmt.Sprintf("%s/%s/%s/%s%s", category, mediaType, difficulty, id, ext)

	// Upload to S3
	_, err := s.s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(s.s3Bucket),
		Key:         aws.String(s3Key),
		Body:        aws.ReadSeekCloser(file),
		ContentType: aws.String(getContentType(ext)),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	// Return CloudFront URL if configured, otherwise S3 URL
	var url string
	if s.cloudfrontDomain != "" {
		url = fmt.Sprintf("https://%s/%s", s.cloudfrontDomain, s3Key)
	} else {
		url = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", s.s3Bucket, s.s3Region, s3Key)
	}
	
	return url, nil
}

func (s *QuizAdminService) validateQuestionRequest(req *repository.CreateQuestionRequest) error {
	// Validate type
	validTypes := map[string]bool{
		"multiple_choice": true,
		"true_false":      true,
		"region_select":   true,
		"comparison":      true,
	}
	if !validTypes[req.Type] {
		return fmt.Errorf("invalid question type: %s", req.Type)
	}

	// Validate media type
	validMediaTypes := map[string]bool{
		"image": true,
		"video": true,
	}
	if !validMediaTypes[req.MediaType] {
		return fmt.Errorf("invalid media type: %s", req.MediaType)
	}

	// Validate difficulty
	validDifficulties := map[string]bool{
		"easy":   true,
		"medium": true,
		"hard":   true,
	}
	if !validDifficulties[req.Difficulty] {
		return fmt.Errorf("invalid difficulty: %s", req.Difficulty)
	}

	// Type-specific validation
	switch req.Type {
	case "multiple_choice":
		if len(req.Options) == 0 {
			return fmt.Errorf("multiple choice questions must have options")
		}
		if req.CorrectIndex == nil {
			return fmt.Errorf("multiple choice questions must have correct_index")
		}
	case "true_false":
		if req.CorrectAnswer == nil {
			return fmt.Errorf("true/false questions must have correct_answer")
		}
	case "region_select":
		if len(req.CorrectRegions) == 0 {
			return fmt.Errorf("region select questions must have correct_regions")
		}
	case "comparison":
		if req.ComparisonMediaURL == nil || *req.ComparisonMediaURL == "" {
			return fmt.Errorf("comparison questions must have comparison_media_url")
		}
		if req.CorrectSide == nil {
			return fmt.Errorf("comparison questions must have correct_side")
		}
	}

	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getContentType(ext string) string {
	contentTypes := map[string]string{
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".gif":  "image/gif",
		".webp": "image/webp",
		".mp4":  "video/mp4",
		".mov":  "video/quicktime",
		".avi":  "video/x-msvideo",
		".webm": "video/webm",
	}
	
	if ct, ok := contentTypes[ext]; ok {
		return ct
	}
	return "application/octet-stream"
}
