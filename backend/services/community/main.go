package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"community/pb"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var db *sql.DB

// gRPC Server
type server struct {
	pb.UnimplementedCommunityServiceServer
}

// Database initialization
func initDB() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://pawfiler:dev_password@postgres:5432/pawfiler?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Connection pool settings (RDS db.t3.micro: max 87 connections)
	db.SetMaxOpenConns(20)                 // 최대 연결 수 (총 60 이하 유지)
	db.SetMaxIdleConns(5)                  // 유휴 연결 수
	db.SetConnMaxLifetime(5 * time.Minute) // 연결 최대 수명
	db.SetConnMaxIdleTime(2 * time.Minute) // 유휴 연결 타임아웃

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connected successfully")
	return nil
}

// GetFeed - 게시글 피드 조회
func (s *server) GetFeed(ctx context.Context, req *pb.GetFeedRequest) (*pb.FeedResponse, error) {
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
		
		// 단일 쿼리로 count와 데이터를 함께 조회
		rows, err = db.QueryContext(ctx, fmt.Sprintf(`
			WITH total AS (
				SELECT COUNT(*) as count FROM community.posts WHERE %s
			)
			SELECT 
				p.id, p.author_id, p.author_nickname, p.author_emoji, p.title, p.body, 
				p.likes, p.comments, p.created_at::text, p.tags,
				t.count as total_count
			FROM community.posts p, total t
			WHERE %s
			ORDER BY p.created_at DESC
			LIMIT $3 OFFSET $4
		`, whereClause, whereClause), searchPattern, searchQuery, pageSize, offset)
	} else {
		// 단일 쿼리로 count와 데이터를 함께 조회
		rows, err = db.QueryContext(ctx, `
			WITH total AS (
				SELECT COUNT(*) as count FROM community.posts
			)
			SELECT 
				p.id, p.author_id, p.author_nickname, p.author_emoji, p.title, p.body, 
				p.likes, p.comments, p.created_at::text, p.tags,
				t.count as total_count
			FROM community.posts p, total t
			ORDER BY p.created_at DESC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch posts")
	}
	defer rows.Close()

	posts := []*pb.Post{}
	for rows.Next() {
		var post pb.Post
		var tags []string
		var count int
		err := rows.Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
			&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, 
			(*pq.StringArray)(&tags), &count)
		if err != nil {
			log.Printf("Error scanning post: %v", err)
			continue
		}
		post.Tags = tags
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
func (s *server) GetPost(ctx context.Context, req *pb.GetPostRequest) (*pb.Post, error) {
	var post pb.Post
	var tags []string

	err := db.QueryRowContext(ctx, `
		SELECT id, author_id, author_nickname, author_emoji, title, body, 
		       likes, comments, created_at::text, tags
		FROM community.posts
		WHERE id = $1
	`, req.PostId).Scan(&post.Id, &post.AuthorId, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, (*pq.StringArray)(&tags))

	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Post not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch post")
	}

	post.Tags = tags
	return &post, nil
}

// CreatePost - 게시글 작성
func (s *server) CreatePost(ctx context.Context, req *pb.CreatePostRequest) (*pb.Post, error) {
	if req.Title == "" {
		return nil, status.Error(codes.InvalidArgument, "Title is required")
	}
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	postID := uuid.New().String()
	createdAt := time.Now()

	_, err := db.ExecContext(ctx, `
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, postID, req.UserId, req.AuthorNickname, req.AuthorEmoji, req.Title, req.Body, pq.Array(req.Tags), createdAt)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create post")
	}

	return &pb.Post{
		Id:             postID,
		AuthorId:       req.UserId,
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		CreatedAt:      createdAt.Format(time.RFC3339),
		Likes:          0,
		Comments:       0,
	}, nil
}

// UpdatePost - 게시글 수정
func (s *server) UpdatePost(ctx context.Context, req *pb.UpdatePostRequest) (*pb.Post, error) {
	// 트랜잭션 시작
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	// 권한 확인
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

	// UPDATE RETURNING으로 한 번에 업데이트하고 결과 조회
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
func (s *server) DeletePost(ctx context.Context, req *pb.DeletePostRequest) (*pb.DeletePostResponse, error) {
	// 트랜잭션 시작
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to start transaction")
	}
	defer tx.Rollback()

	// 권한 확인
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

	// 게시글 삭제 (CASCADE로 댓글과 좋아요도 자동 삭제)
	_, err = tx.ExecContext(ctx, "DELETE FROM community.posts WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete post")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to commit transaction")
	}

	return &pb.DeletePostResponse{Success: true}, nil
}

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "50053"
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterCommunityServiceServer(s, &server{})

	log.Printf("Community gRPC server listening on :%s", port)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}

// GetComments - 댓글 목록 조회
func (s *server) GetComments(ctx context.Context, req *pb.GetCommentsRequest) (*pb.CommentsResponse, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, post_id, author_id, author_nickname, author_emoji, content, created_at::text
		FROM community.comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`, req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch comments")
	}
	defer rows.Close()

	comments := []*pb.Comment{}
	for rows.Next() {
		var comment pb.Comment
		err := rows.Scan(&comment.Id, &comment.PostId, &comment.AuthorId, &comment.AuthorNickname,
			&comment.AuthorEmoji, &comment.Body, &comment.CreatedAt)
		if err != nil {
			log.Printf("Error scanning comment: %v", err)
			continue
		}
		comments = append(comments, &comment)
	}

	return &pb.CommentsResponse{Comments: comments}, nil
}

// CreateComment - 댓글 작성
func (s *server) CreateComment(ctx context.Context, req *pb.CreateCommentRequest) (*pb.Comment, error) {
	if req.Body == "" {
		return nil, status.Error(codes.InvalidArgument, "Body is required")
	}

	// Check if post exists
	var exists bool
	err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.posts WHERE id = $1)", req.PostId).Scan(&exists)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check post")
	}
	if !exists {
		return nil, status.Error(codes.NotFound, "Post not found")
	}

	commentID := uuid.New().String()
	createdAt := time.Now()

	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}
	defer tx.Rollback()

	// Insert comment
	_, err = tx.ExecContext(ctx, `
		INSERT INTO community.comments (id, post_id, author_id, author_nickname, author_emoji, content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, commentID, req.PostId, req.UserId, req.AuthorNickname, req.AuthorEmoji, req.Body, createdAt)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}

	// Update comment count
	_, err = tx.ExecContext(ctx, "UPDATE community.posts SET comments = comments + 1 WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update comment count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to create comment")
	}

	return &pb.Comment{
		Id:             commentID,
		PostId:         req.PostId,
		AuthorId:       req.UserId,
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Body:           req.Body,
		CreatedAt:      createdAt.Format(time.RFC3339),
	}, nil
}

// DeleteComment - 댓글 삭제
func (s *server) DeleteComment(ctx context.Context, req *pb.DeleteCommentRequest) (*pb.DeleteCommentResponse, error) {
	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}
	defer tx.Rollback()

	// Get post_id and author_id before deleting
	var postID, authorID string
	err = tx.QueryRowContext(ctx, "SELECT post_id, author_id FROM community.comments WHERE id = $1", req.CommentId).Scan(&postID, &authorID)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "Comment not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to find comment")
	}

	if authorID != req.UserId {
		return nil, status.Error(codes.PermissionDenied, "Forbidden")
	}

	// Delete comment
	_, err = tx.ExecContext(ctx, "DELETE FROM community.comments WHERE id = $1", req.CommentId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}

	// Update comment count
	_, err = tx.ExecContext(ctx, "UPDATE community.posts SET comments = GREATEST(comments - 1, 0) WHERE id = $1", postID)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update comment count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to delete comment")
	}

	return &pb.DeleteCommentResponse{Success: true}, nil
}

// LikePost - 게시글 좋아요
func (s *server) LikePost(ctx context.Context, req *pb.LikePostRequest) (*pb.LikePostResponse, error) {
	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}
	defer tx.Rollback()

	// Check if already liked
	var exists bool
	err = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", req.PostId, req.UserId).Scan(&exists)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check like status")
	}

	if exists {
		return &pb.LikePostResponse{Success: true, AlreadyLiked: true}, nil
	}

	// Insert like
	_, err = tx.ExecContext(ctx, `
		INSERT INTO community.likes (id, post_id, user_id, created_at)
		VALUES ($1, $2, $3, NOW())
	`, uuid.New().String(), req.PostId, req.UserId)

	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	// Update likes count
	_, err = tx.ExecContext(ctx, "UPDATE community.posts SET likes = likes + 1 WHERE id = $1", req.PostId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to update like count")
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to like post")
	}

	return &pb.LikePostResponse{Success: true, AlreadyLiked: false}, nil
}

// UnlikePost - 게시글 좋아요 취소
func (s *server) UnlikePost(ctx context.Context, req *pb.UnlikePostRequest) (*pb.UnlikePostResponse, error) {
	// Start transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}
	defer tx.Rollback()

	// Delete like
	result, err := tx.ExecContext(ctx, "DELETE FROM community.likes WHERE post_id = $1 AND user_id = $2", req.PostId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		_, err = tx.ExecContext(ctx, "UPDATE community.posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1", req.PostId)
		if err != nil {
			return nil, status.Error(codes.Internal, "Failed to update like count")
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, "Failed to unlike post")
	}

	return &pb.UnlikePostResponse{Success: true}, nil
}

// CheckLike - 좋아요 상태 확인
func (s *server) CheckLike(ctx context.Context, req *pb.CheckLikeRequest) (*pb.CheckLikeResponse, error) {
	var liked bool
	err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", req.PostId, req.UserId).Scan(&liked)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to check like status")
	}

	return &pb.CheckLikeResponse{Liked: liked}, nil
}

// GetNotices - 공지사항 조회
func (s *server) GetNotices(ctx context.Context, req *pb.GetNoticesRequest) (*pb.NoticesResponse, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, title
		FROM community.posts
		WHERE '공지' = ANY(tags)
		ORDER BY created_at DESC
		LIMIT 3
	`)
	if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch notices")
	}
	defer rows.Close()

	notices := []*pb.Notice{}
	for rows.Next() {
		var notice pb.Notice
		if err := rows.Scan(&notice.Id, &notice.Title); err != nil {
			log.Printf("Error scanning notice: %v", err)
			continue
		}
		notices = append(notices, &notice)
	}

	return &pb.NoticesResponse{Notices: notices}, nil
}

// GetTopDetective - 탐정 랭킹 조회
func (s *server) GetTopDetective(ctx context.Context, req *pb.GetTopDetectiveRequest) (*pb.TopDetectiveResponse, error) {
	var detective pb.TopDetectiveResponse
	err := db.QueryRowContext(ctx, `
		SELECT p.author_nickname, p.author_emoji, SUM(p.likes) as total_likes
		FROM community.posts p
		WHERE p.created_at >= DATE_TRUNC('month', NOW())
		GROUP BY p.author_id, p.author_nickname, p.author_emoji
		ORDER BY total_likes DESC
		LIMIT 1
	`).Scan(&detective.AuthorNickname, &detective.AuthorEmoji, &detective.TotalLikes)

	if err == sql.ErrNoRows {
		detective = pb.TopDetectiveResponse{
			AuthorNickname: "아직 없음",
			AuthorEmoji:    "🏆",
			TotalLikes:     0,
		}
	} else if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch top detective")
	}

	return &detective, nil
}

// GetHotTopic - 인기 토픽 조회
func (s *server) GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error) {
	var topic pb.HotTopicResponse
	err := db.QueryRowContext(ctx, `
		SELECT tag, COUNT(*) as count
		FROM community.posts, UNNEST(tags) as tag
		WHERE created_at >= CURRENT_DATE
		GROUP BY tag
		ORDER BY count DESC
		LIMIT 1
	`).Scan(&topic.Tag, &topic.Count)

	if err == sql.ErrNoRows {
		err = db.QueryRowContext(ctx, `
			SELECT tag, COUNT(*) as count
			FROM community.posts, UNNEST(tags) as tag
			GROUP BY tag
			ORDER BY count DESC
			LIMIT 1
		`).Scan(&topic.Tag, &topic.Count)
	}

	if err == sql.ErrNoRows {
		topic = pb.HotTopicResponse{Tag: "없음", Count: 0}
	} else if err != nil {
		return nil, status.Error(codes.Internal, "Failed to fetch hot topic")
	}

	return &topic, nil
}
