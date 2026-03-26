package handler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"community/pb"

	"github.com/aws/aws-sdk-go-v2/aws"
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

		if searchType == "body" {
			rows, err = h.db.QueryContext(ctx, `
				SELECT 
					id, author_id, author_nickname, author_emoji, title, body, 
					likes, comments, created_at::text, tags,
					COUNT(*) OVER() as total_count, media_url, media_type, is_admin_post,
					true_votes, false_votes, is_correct
				FROM community.posts
				WHERE body ILIKE $1
				ORDER BY is_admin_post DESC, created_at DESC
				LIMIT $2 OFFSET $3
			`, searchPattern, pageSize, offset)
		} else {
			var whereClause string
			if searchType == "all" {
				whereClause = "(title ILIKE $1 OR body ILIKE $1 OR $2 = ANY(tags))"
			} else {
				whereClause = "(title ILIKE $1 OR $2 = ANY(tags))"
			}
			rows, err = h.db.QueryContext(ctx, fmt.Sprintf(`
				SELECT 
					id, author_id, author_nickname, author_emoji, title, body, 
					likes, comments, created_at::text, tags,
					COUNT(*) OVER() as total_count, media_url, media_type, is_admin_post,
					true_votes, false_votes, is_correct
				FROM community.posts
				WHERE %s
				ORDER BY is_admin_post DESC, created_at DESC
				LIMIT $3 OFFSET $4
			`, whereClause), searchPattern, searchQuery, pageSize, offset)
		}
	} else {
		rows, err = h.db.QueryContext(ctx, `
			SELECT 
				id, author_id, author_nickname, author_emoji, title, body, 
				likes, comments, created_at::text, tags,
				COUNT(*) OVER() as total_count, media_url, media_type, is_admin_post,
				true_votes, false_votes, is_correct
			FROM community.posts
			ORDER BY is_admin_post DESC, created_at DESC
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
		var isCorrect sql.NullBool
		var count int
		err := rows.Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
			&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt,
			(*pq.StringArray)(&tags), &count, &mediaUrl, &mediaType, &post.IsAdminPost,
			&post.TrueVotes, &post.FalseVotes, &isCorrect)
		if err != nil {
			log.Printf("Error scanning post: %v", err)
			continue
		}
		post.Tags = tags
		post.MediaUrl = mediaUrl.String
		post.MediaType = mediaType.String
		if isCorrect.Valid {
			post.IsCorrect = &isCorrect.Bool
		}
		totalCount = int32(count)
		posts = append(posts, &post)
	}

	// Redis likes 일괄 반영 — MGet으로 한 번에 조회 (N+1 방지)
	if h.rdb != nil && len(posts) > 0 {
		keys := make([]string, len(posts))
		for i, p := range posts {
			keys[i] = "likes:" + p.Id
		}
		vals, err := h.rdb.MGet(ctx, keys...).Result()
		if err == nil {
			for i, v := range vals {
				if v != nil {
					if s, ok := v.(string); ok {
						var n int64
						fmt.Sscanf(s, "%d", &n)
						posts[i].Likes = int32(n)
					}
				}
			}
		}
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
	var isCorrect sql.NullBool

	err := h.db.QueryRowContext(ctx, `
		SELECT id, author_id, author_nickname, author_emoji, title, body, 
		       likes, comments, created_at::text, tags, media_url, media_type, is_admin_post,
		       true_votes, false_votes, is_correct
		FROM community.posts
		WHERE id = $1
	`, req.PostId).Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt,
		(*pq.StringArray)(&tags), &mediaUrl, &mediaType, &post.IsAdminPost,
		&post.TrueVotes, &post.FalseVotes, &isCorrect)

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
	if isCorrect.Valid {
		post.IsCorrect = &isCorrect.Bool
	}

	// Redis에 likes 캐시 있으면 덮어씀
	if h.rdb != nil {
		if val, err := h.rdb.Get(ctx, "likes:"+post.Id).Int64(); err == nil {
			post.Likes = int32(val)
		}
	}
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
	if req.MediaUrl == "" {
		return nil, status.Error(codes.InvalidArgument, "Media is required")
	}
	if req.IsCorrect == nil {
		return nil, status.Error(codes.InvalidArgument, "isCorrect is required")
	}

	// Istio가 주입한 x-user-id 헤더 우선, 없으면 proto 필드 사용 (내부 서비스 호출 호환)
	userID := userIDFromContext(ctx, req.UserId)

	// user 서비스 gRPC 호출로 최신 닉네임/아바타 조회
	nickname, avatarEmoji := h.userClient.GetProfile(ctx, userID)

	// is_admin_post는 강제 false - 어드민은 별도 엔드포인트 사용
	isAdminPost := false

	postID := uuid.New().String()
	createdAt := time.Now()

	_, err := h.db.ExecContext(ctx, `
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, media_url, media_type, is_admin_post, is_correct, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, postID, userID, nickname, avatarEmoji, req.Title, req.Body,
		pq.Array(req.Tags), nullableString(req.MediaUrl), nullableString(req.MediaType), isAdminPost, req.IsCorrect, createdAt)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create post")
	}

	// 미디어 linked 처리 — 연결되면 추적 테이블에서 바로 삭제
	if req.MediaUrl != "" {
		h.db.ExecContext(ctx, "DELETE FROM community.media_uploads WHERE media_url = $1", req.MediaUrl)
	}

	return &pb.Post{
		Id:             postID,
		AuthorId:       userID,
		AuthorNickname: nickname,
		AuthorEmoji:    avatarEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		MediaUrl:       req.MediaUrl,
		MediaType:      req.MediaType,
		IsAdminPost:    isAdminPost,
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

	userID := userIDFromContext(ctx, req.UserId)
	if authorID != userID {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	if strings.TrimSpace(req.Title) == "" {
		return nil, status.Error(codes.InvalidArgument, "Title is required")
	}

	var post pb.Post
	var tags []string
	var mediaUrl, mediaType sql.NullString
	err = tx.QueryRowContext(ctx, `
		UPDATE community.posts
		SET title = $1, body = $2, tags = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING id, author_id, author_nickname, author_emoji, title, body, 
		          likes, comments, created_at::text, tags, media_url, media_type
	`, req.Title, req.Body, pq.Array(req.Tags), req.PostId).Scan(
		&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt,
		(*pq.StringArray)(&tags), &mediaUrl, &mediaType)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit transaction")
	}

	post.Tags = tags
	post.MediaUrl = mediaUrl.String
	post.MediaType = mediaType.String
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

	deleteUserID := userIDFromContext(ctx, req.UserId)
	if authorID != deleteUserID {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	_, err = tx.ExecContext(ctx, "DELETE FROM community.posts WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit transaction")
	}

	// Redis likes 키 삭제
	if h.rdb != nil {
		h.rdb.Del(context.Background(), "likes:"+req.PostId)
	}

	// S3 삭제는 트랜잭션 커밋 후 비동기 처리 — row lock 유지 시간 최소화
	if mediaURL != "" {
		go func() {
			for i := 0; i < 3; i++ {
				if err := h.deleteMediaFromS3(mediaURL); err == nil {
					return
				}
				time.Sleep(time.Duration(i+1) * 5 * time.Second)
			}
			log.Printf("[ERROR] S3 delete permanently failed after 3 attempts: %s", mediaURL)
		}()
	}

	return &pb.DeletePostResponse{Success: true}, nil
}

func (h *Handler) deleteMediaFromS3(mediaURL string) error {
	if h.s3 == nil {
		return fmt.Errorf("s3 client not initialized")
	}
	parts := strings.Split(mediaURL, "/")
	if len(parts) < 4 {
		return fmt.Errorf("invalid media URL format: %s", mediaURL)
	}
	key := strings.Join(parts[len(parts)-3:], "/")

	_, err := h.s3.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(h.s3Bucket),
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

// CreateAdminPost - 운영진 게시글 작성 (미디어/투표 없이, is_admin_post=true 강제)
func (h *Handler) CreateAdminPost(ctx context.Context, req *pb.CreateAdminPostRequest) (*pb.Post, error) {
	if req.Title == "" {
		return nil, status.Error(codes.InvalidArgument, "Title is required")
	}
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	userID := userIDFromContext(ctx, req.UserId)
	nickname, avatarEmoji := h.userClient.GetProfile(ctx, userID)

	postID := uuid.New().String()
	createdAt := time.Now()

	_, err := h.db.ExecContext(ctx, `
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, media_url, media_type, is_admin_post, is_correct, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, true, $8, $9)
	`, postID, userID, nickname, avatarEmoji, req.Title, req.Body,
		pq.Array(req.Tags), req.IsCorrect, createdAt)

	if err != nil {
		log.Printf("CreateAdminPost error: %v", err)
		return nil, status.Error(codes.Internal, "Failed to create admin post")
	}

	return &pb.Post{
		Id:             postID,
		AuthorId:       userID,
		AuthorNickname: nickname,
		AuthorEmoji:    avatarEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		IsAdminPost:    true,
		CreatedAt:      createdAt.Format(time.RFC3339),
		Likes:          0,
		Comments:       0,
	}, nil
}
