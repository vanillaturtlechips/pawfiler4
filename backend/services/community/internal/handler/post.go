package handler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"community/pb"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// GetFeed - 게시글 피드 조회
func (h *Handler) GetFeed(ctx context.Context, req *pb.GetFeedRequest) (*pb.FeedResponse, error) {
	page := req.Page
	if page <= 0 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = 15
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize
	searchQuery := req.SearchQuery
	searchType := req.SearchType

	var totalCount int32
	var rows *sql.Rows
	var err error

	if searchQuery != "" {
		searchPattern := "%" + searchQuery + "%"
		
		var whereClause string
		switch searchType {
		case "body":
			whereClause = "body ILIKE $1"
		case "all":
			whereClause = "title ILIKE $1 OR body ILIKE $1"
		default:
			whereClause = "title ILIKE $1"
		}
		whereClause += " OR $2 = ANY(tags)"
		
		rows, err = h.db.QueryContext(ctx, fmt.Sprintf(`
			SELECT 
				id, author_id, author_nickname, author_emoji, title, body, 
				likes, comments, created_at::text, tags,
				COUNT(*) OVER() as total_count, media_url, media_type, is_admin_post
			FROM community.posts
			WHERE %s
			ORDER BY created_at DESC
			LIMIT $3 OFFSET $4
		`, whereClause), searchPattern, searchQuery, pageSize, offset)
	} else {
		rows, err = h.db.QueryContext(ctx, `
			SELECT 
				id, author_id, author_nickname, author_emoji, title, body, 
				likes, comments, created_at::text, tags,
				COUNT(*) OVER() as total_count, media_url, media_type, is_admin_post
			FROM community.posts
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if err != nil {
		log.Printf("GetFeed query error: %v", err); return nil, status.Error(codes.Internal, "Failed to fetch posts")
	}
	defer rows.Close()

	posts := []*pb.Post{}
	for rows.Next() {
		var post pb.Post
		var tags []string
		var mediaUrl, mediaType sql.NullString
		var count int
		err := rows.Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
			&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt,
			(*pq.StringArray)(&tags), &count, &mediaUrl, &mediaType, &post.IsAdminPost)
		if err != nil {
			log.Printf("Error scanning post: %v", err)
			continue
		}
		post.Tags = tags
		post.MediaUrl = mediaUrl.String
		post.MediaType = mediaType.String
		totalCount = int32(count)
		posts = append(posts, &post)
	}

	return &pb.FeedResponse{
		Posts:      posts,
		TotalCount: totalCount,
		Page:       page,
	}, nil
}

// GetPost - 게시글 상세 조회
func (h *Handler) GetPost(ctx context.Context, req *pb.GetPostRequest) (*pb.Post, error) {
	var post pb.Post
	var tags []string
	var mediaUrl, mediaType sql.NullString

	err := h.db.QueryRowContext(ctx, `
		SELECT id, author_id, author_nickname, author_emoji, title, body, 
		       likes, comments, created_at::text, tags, media_url, media_type, is_admin_post
		FROM community.posts
		WHERE id = $1
	`, req.PostId).Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt,
		(*pq.StringArray)(&tags), &mediaUrl, &mediaType, &post.IsAdminPost)

	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Post not found")
	}
	if err != nil {
		log.Printf("GetPost error: %v", err)
		return nil, status.Error(codes.Internal, "Failed to fetch post")
	}

	post.Tags = tags
	post.MediaUrl = mediaUrl.String
	post.MediaType = mediaType.String
	return &post, nil
}

// CreatePost - 게시글 작성
// author_nickname/emoji는 user 서비스 gRPC 호출로 최신값을 가져옴
func (h *Handler) CreatePost(ctx context.Context, req *pb.CreatePostRequest) (*pb.Post, error) {
	if req.Title == "" {
		return nil, status.Error(codes.InvalidArgument, "Title is required")
	}
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	// user 서비스 gRPC 호출로 최신 닉네임/아바타 조회
	nickname, avatarEmoji := h.userClient.GetProfile(ctx, req.UserId)

	postID := uuid.New().String()
	createdAt := time.Now()

	_, err := h.db.ExecContext(ctx, `
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, media_url, media_type, is_admin_post, is_correct, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, postID, req.UserId, nickname, avatarEmoji, req.Title, req.Body,
		pq.Array(req.Tags), nullableString(req.MediaUrl), nullableString(req.MediaType), req.IsAdminPost, req.IsCorrect, createdAt)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create post")
	}

	return &pb.Post{
		Id:             postID,
		AuthorId:       req.UserId,
		AuthorNickname: nickname,
		AuthorEmoji:    avatarEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		MediaUrl:       req.MediaUrl,
		MediaType:      req.MediaType,
		IsAdminPost:    req.IsAdminPost,
		CreatedAt:      createdAt.Format(time.RFC3339),
		Likes:          0,
		Comments:       0,
	}, nil
}

// UpdatePost - 게시글 수정
func (h *Handler) UpdatePost(ctx context.Context, req *pb.UpdatePostRequest) (*pb.Post, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	var authorID string
	err = tx.QueryRowContext(ctx, "SELECT author_id FROM community.posts WHERE id = $1 FOR UPDATE", req.PostId).Scan(&authorID)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Post not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check post")
	}

	if authorID != req.UserId {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	var post pb.Post
	var tags []string
	err = tx.QueryRowContext(ctx, `
		UPDATE community.posts
		SET title = $1, body = $2, tags = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING id, author_id, author_nickname, author_emoji, title, body, 
		          likes, comments, created_at::text, tags
	`, req.Title, req.Body, pq.Array(req.Tags), req.PostId).Scan(
		&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, 
		(*pq.StringArray)(&tags))

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit transaction")
	}

	post.Tags = tags
	return &post, nil
}

// DeletePost - 게시글 삭제
func (h *Handler) DeletePost(ctx context.Context, req *pb.DeletePostRequest) (*pb.DeletePostResponse, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	var authorID, mediaURL string
	err = tx.QueryRowContext(ctx, "SELECT author_id, COALESCE(media_url, '') FROM community.posts WHERE id = $1 FOR UPDATE", req.PostId).Scan(&authorID, &mediaURL)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Post not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check post")
	}

	if authorID != req.UserId {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	if mediaURL != "" {
		if err := deleteMediaFromS3(mediaURL); err != nil {
			log.Printf("S3 delete failed: %v", err)
			return nil, status.Error(codes.Internal, "Failed to delete media")
		}
	}

	_, err = tx.ExecContext(ctx, "DELETE FROM community.posts WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit transaction")
	}

	return &pb.DeletePostResponse{Success: true}, nil
}

func deleteMediaFromS3(mediaURL string) error {
	parts := strings.Split(mediaURL, "/")
	if len(parts) < 4 {
		return fmt.Errorf("invalid media URL format: %s", mediaURL)
	}
	key := strings.Join(parts[len(parts)-3:], "/")

	bucket := os.Getenv("S3_COMMUNITY_BUCKET")
	if bucket == "" {
		bucket = "pawfiler-community-media"
	}
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-northeast-2"
	}

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(region))
	if err != nil {
		return fmt.Errorf("AWS config error: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	_, err = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("S3 delete error: %w", err)
	}
	log.Printf("✅ Deleted media from S3: %s", key)
	return nil
}

func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
