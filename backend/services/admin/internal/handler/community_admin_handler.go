package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/gorilla/mux"

	"github.com/pawfiler/backend/services/admin/internal/repository"
)

type CommunityAdminHandler struct {
	repo             *repository.CommunityRepository
	quizRepo         *repository.QuizRepository
	s3Client         *s3.S3
	s3Bucket         string
	cloudfrontDomain string
}

func NewCommunityAdminHandler(repo *repository.CommunityRepository, quizRepo *repository.QuizRepository) *CommunityAdminHandler {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-northeast-2"
	}
	bucket := os.Getenv("COMMUNITY_S3_BUCKET")
	if bucket == "" {
		bucket = os.Getenv("S3_BUCKET")
	}
	if bucket == "" {
		bucket = "pawfiler-quiz-media"
	}
	sess := session.Must(session.NewSession(&aws.Config{
		Region: aws.String(region),
	}))
	return &CommunityAdminHandler{
		repo:             repo,
		quizRepo:         quizRepo,
		s3Client:         s3.New(sess),
		s3Bucket:         bucket,
		cloudfrontDomain: os.Getenv("CLOUDFRONT_DOMAIN"),
	}
}

func (h *CommunityAdminHandler) extractS3Key(mediaURL string) string {
	if mediaURL == "" {
		return ""
	}
	parsed, err := url.Parse(mediaURL)
	if err != nil {
		return ""
	}
	if h.cloudfrontDomain != "" && parsed.Host == h.cloudfrontDomain {
		return strings.TrimPrefix(parsed.Path, "/")
	}
	if strings.HasSuffix(parsed.Host, ".amazonaws.com") {
		return strings.TrimPrefix(parsed.Path, "/")
	}
	return ""
}

type ListPostsResponse struct {
	Posts      []repository.PostWithVotes `json:"posts"`
	TotalCount int                        `json:"totalCount"`
	Page       int                        `json:"page"`
}

type GetCommentsResponse struct {
	Comments []repository.Comment `json:"comments"`
}

type PendingReviewResponse struct {
	Posts      []repository.PostWithVotes `json:"posts"`
	TotalCount int                        `json:"totalCount"`
	Page       int                        `json:"page"`
}

type PublishQuizRequest struct {
	Difficulty   string `json:"difficulty"`
	Category     string `json:"category"`
	Explanation  string `json:"explanation"`
	CorrectAnswer *bool `json:"correct_answer"`
}

// GET /admin/community/posts
func (h *CommunityAdminHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	search := r.URL.Query().Get("search")
	searchType := r.URL.Query().Get("search_type")

	posts, total, err := h.repo.ListPosts(page, pageSize, search, searchType)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, ListPostsResponse{
		Posts:      posts,
		TotalCount: total,
		Page:       page,
	})
}

// GET /admin/community/posts/review
func (h *CommunityAdminHandler) GetPostsPendingReview(w http.ResponseWriter, r *http.Request) {
	minVotes, _ := strconv.Atoi(r.URL.Query().Get("min_votes"))
	if minVotes < 1 {
		minVotes = 5
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	posts, total, err := h.repo.GetPostsPendingReview(minVotes, page, pageSize)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, PendingReviewResponse{
		Posts:      posts,
		TotalCount: total,
		Page:       page,
	})
}

// POST /admin/community/posts/{id}/publish
func (h *CommunityAdminHandler) PublishAsQuizQuestion(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var req PublishQuizRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Difficulty == "" || req.Category == "" || req.Explanation == "" {
		respondError(w, http.StatusBadRequest, "difficulty, category, explanation are required")
		return
	}

	post, err := h.repo.GetPostByID(id)
	if err != nil {
		if err.Error() == "post not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if post.MediaURL == "" {
		respondError(w, http.StatusBadRequest, "post has no media")
		return
	}

	correctAnswer := post.IsCorrect
	if req.CorrectAnswer != nil {
		correctAnswer = req.CorrectAnswer
	}

	mediaType := post.MediaType
	if mediaType == "" {
		mediaType = "image"
	}

	question, err := h.quizRepo.CreateQuestion(&repository.CreateQuestionRequest{
		Type:          "true_false",
		MediaType:     mediaType,
		MediaURL:      post.MediaURL,
		ThumbnailEmoji: "🐾",
		Difficulty:    req.Difficulty,
		Category:      req.Category,
		Explanation:   req.Explanation,
		CorrectAnswer: correctAnswer,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, question)
}

// PUT /admin/community/posts/{id}
func (h *CommunityAdminHandler) UpdatePost(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var req repository.UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.repo.UpdatePost(id, &req); err != nil {
		if err.Error() == "post not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /admin/community/posts/{id}
func (h *CommunityAdminHandler) DeletePost(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	// media_url 먼저 조회해서 S3 키 추출
	post, err := h.repo.GetPostByID(id)
	if err != nil {
		if err.Error() == "post not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// DB 레코드 삭제
	if err := h.repo.DeletePost(id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// S3 미디어 삭제
	if key := h.extractS3Key(post.MediaURL); key != "" {
		if _, err := h.s3Client.DeleteObject(&s3.DeleteObjectInput{
			Bucket: aws.String(h.s3Bucket),
			Key:    aws.String(key),
		}); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to delete media from S3")
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /admin/community/posts/{id}/comments
func (h *CommunityAdminHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	postID := mux.Vars(r)["id"]

	comments, err := h.repo.GetComments(postID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, GetCommentsResponse{Comments: comments})
}

// DELETE /admin/community/comments/{id}
func (h *CommunityAdminHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.repo.DeleteComment(id); err != nil {
		if err.Error() == "comment not found" {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /admin/community/posts
func (h *CommunityAdminHandler) CreateAdminPost(w http.ResponseWriter, r *http.Request) {
	var req repository.CreateAdminPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" || req.Body == "" {
		respondError(w, http.StatusBadRequest, "title and body are required")
		return
	}
	if req.Nickname == "" {
		req.Nickname = "운영진"
	}
	if req.Emoji == "" {
		req.Emoji = "🐾"
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	post, err := h.repo.CreateAdminPost(&req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, post)
}
