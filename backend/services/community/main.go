package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

var db *sql.DB

// Models
type Post struct {
	ID             string    `json:"id"`
	AuthorID       string    `json:"authorId"`
	AuthorNickname string    `json:"authorNickname"`
	AuthorEmoji    string    `json:"authorEmoji"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	Likes          int       `json:"likes"`
	Comments       int       `json:"comments"`
	CreatedAt      string    `json:"createdAt"`
	Tags           []string  `json:"tags"`
	UserID         string    `json:"userId,omitempty"`
}

type Comment struct {
	ID             string `json:"id"`
	PostID         string `json:"postId"`
	AuthorID       string `json:"authorId"`
	AuthorNickname string `json:"authorNickname"`
	AuthorEmoji    string `json:"authorEmoji"`
	Body           string `json:"body"`
	CreatedAt      string `json:"createdAt"`
	UserID         string `json:"userId,omitempty"`
}

type FeedResponse struct {
	Posts      []Post `json:"posts"`
	TotalCount int    `json:"totalCount"`
	Page       int    `json:"page"`
}

type CreatePostRequest struct {
	UserID         string   `json:"userId"`
	AuthorNickname string   `json:"authorNickname"`
	AuthorEmoji    string   `json:"authorEmoji"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Tags           []string `json:"tags"`
}

type UpdatePostRequest struct {
	PostID string   `json:"postId"`
	Title  string   `json:"title"`
	Body   string   `json:"body"`
	Tags   []string `json:"tags"`
}

type DeletePostRequest struct {
	PostID string `json:"postId"`
}

type CreateCommentRequest struct {
	PostID         string `json:"postId"`
	UserID         string `json:"userId"`
	AuthorNickname string `json:"authorNickname"`
	AuthorEmoji    string `json:"authorEmoji"`
	Body           string `json:"body"`
}

type DeleteCommentRequest struct {
	CommentID string `json:"commentId"`
}

type LikeRequest struct {
	PostID string `json:"postId"`
	UserID string `json:"userId"`
}

type UnlikeRequest struct {
	PostID string `json:"postId"`
	UserID string `json:"userId"`
}

type CheckLikeRequest struct {
	PostID string `json:"postId"`
	UserID string `json:"userId"`
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

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connected successfully")
	return nil
}

// Handlers
func getPostHandler(w http.ResponseWriter, r *http.Request) {
	postID := r.URL.Query().Get("postId")
	if postID == "" {
		http.Error(w, "postId is required", http.StatusBadRequest)
		return
	}

	var post Post
	post.Tags = []string{}
	var tagsJSON []byte

	err := db.QueryRow(`
		SELECT id, author_id, author_nickname, author_emoji, title, body, 
		       likes, comments, created_at::text, tags
		FROM community.posts
		WHERE id = $1
	`, postID).Scan(&post.ID, &post.AuthorID, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, &tagsJSON)
	if len(tagsJSON) > 0 {
		_ = json.Unmarshal(tagsJSON, &post.Tags)
	}

	if err == sql.ErrNoRows {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error querying post: %v", err)
		http.Error(w, "Failed to fetch post", http.StatusInternalServerError)
		return
	}

	post.UserID = post.AuthorID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(post)
}

func getFeedHandler(w http.ResponseWriter, r *http.Request) {
	page := 1
	pageSize := 15
	searchQuery := r.URL.Query().Get("search")
	searchType := r.URL.Query().Get("searchType") // title, body, all

	if p := r.URL.Query().Get("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}

	if ps := r.URL.Query().Get("pageSize"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 100 {
			pageSize = parsed
		}
	}

	offset := (page - 1) * pageSize

	// Build query based on search parameter
	var totalCount int
	var rows *sql.Rows
	var err error

	if searchQuery != "" {
		// Search query with ILIKE for case-insensitive search
		searchPattern := "%" + searchQuery + "%"
		
		var whereClause string
		switch searchType {
		case "body":
			whereClause = "body ILIKE $1"
		case "all":
			whereClause = "title ILIKE $1 OR body ILIKE $1"
		default: // "title" or empty
			whereClause = "title ILIKE $1"
		}
		
		// Add tag search for all types (JSONB)
		whereClause += " OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS t(value) WHERE t.value = $2)"
		
		// Get total count with search
		err = db.QueryRow(fmt.Sprintf(`
			SELECT COUNT(*) FROM community.posts 
			WHERE %s
		`, whereClause), searchPattern, searchQuery).Scan(&totalCount)
		if err != nil {
			log.Printf("Error counting posts with search: %v", err)
			http.Error(w, "Failed to count posts", http.StatusInternalServerError)
			return
		}

		// Get posts with search
		rows, err = db.Query(fmt.Sprintf(`
			SELECT id, author_id, author_nickname, author_emoji, title, body, 
			       likes, comments, created_at::text, tags
			FROM community.posts
			WHERE %s
			ORDER BY created_at DESC
			LIMIT $3 OFFSET $4
		`, whereClause), searchPattern, searchQuery, pageSize, offset)
	} else {
		// Get total count without search
		err = db.QueryRow("SELECT COUNT(*) FROM community.posts").Scan(&totalCount)
		if err != nil {
			log.Printf("Error counting posts: %v", err)
			http.Error(w, "Failed to count posts", http.StatusInternalServerError)
			return
		}

		// Get posts without search
		rows, err = db.Query(`
			SELECT id, author_id, author_nickname, author_emoji, title, body, 
			       likes, comments, created_at::text, tags
			FROM community.posts
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if err != nil {
		log.Printf("Error querying posts: %v", err)
		http.Error(w, "Failed to fetch posts", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	posts := []Post{}
	for rows.Next() {
		var post Post
		post.Tags = []string{}
		var tagsJSON []byte
		err := rows.Scan(&post.ID, &post.AuthorID, &post.AuthorNickname, &post.AuthorEmoji,
			&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, &tagsJSON)
		if err != nil {
			log.Printf("Error scanning post: %v", err)
			continue
		}
		if len(tagsJSON) > 0 {
			_ = json.Unmarshal(tagsJSON, &post.Tags)
		}

		post.UserID = post.AuthorID
		posts = append(posts, post)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(FeedResponse{
		Posts:      posts,
		TotalCount: totalCount,
		Page:       page,
	})
}

func createPostHandler(w http.ResponseWriter, r *http.Request) {
	var req CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	postID := uuid.New().String()
	
	// Store tags as JSONB
	tagsJSON, _ := json.Marshal(req.Tags)

	_, err := db.Exec(`
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
	`, postID, req.UserID, req.AuthorNickname, req.AuthorEmoji, req.Title, req.Body, string(tagsJSON))

	if err != nil {
		log.Printf("Error creating post: %v", err)
		http.Error(w, "Failed to create post", http.StatusInternalServerError)
		return
	}

	post := Post{
		ID:             postID,
		AuthorID:       req.UserID,
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		CreatedAt:      time.Now().Format(time.RFC3339),
		Likes:          0,
		Comments:       0,
		UserID:         req.UserID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(post)
}

func updatePostHandler(w http.ResponseWriter, r *http.Request) {
	var req UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update tags as JSONB
	tagsJSON, _ := json.Marshal(req.Tags)

	_, err := db.Exec(`
		UPDATE community.posts
		SET title = $1, body = $2, tags = $3::jsonb, updated_at = NOW()
		WHERE id = $4
	`, req.Title, req.Body, string(tagsJSON), req.PostID)

	if err != nil {
		log.Printf("Error updating post: %v", err)
		http.Error(w, "Failed to update post", http.StatusInternalServerError)
		return
	}

	// Fetch updated post
	var post Post
	post.Tags = []string{}
	var tagsJSON2 []byte
	err = db.QueryRow(`
		SELECT id, author_id, author_nickname, author_emoji, title, body, 
		       likes, comments, created_at::text, tags
		FROM community.posts
		WHERE id = $1
	`, req.PostID).Scan(&post.ID, &post.AuthorID, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &post.Likes, &post.Comments, &post.CreatedAt, &tagsJSON2)
	if len(tagsJSON2) > 0 {
		_ = json.Unmarshal(tagsJSON2, &post.Tags)
	}

	if err != nil {
		log.Printf("Error fetching updated post: %v", err)
		http.Error(w, "Failed to fetch updated post", http.StatusInternalServerError)
		return
	}

	post.UserID = post.AuthorID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(post)
}

func deletePostHandler(w http.ResponseWriter, r *http.Request) {
	var req DeletePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Check if post exists and get author_id for authorization
	var authorID string
	err := db.QueryRow("SELECT author_id FROM community.posts WHERE id = $1", req.PostID).Scan(&authorID)
	if err == sql.ErrNoRows {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error checking post: %v", err)
		http.Error(w, "Failed to check post", http.StatusInternalServerError)
		return
	}

	// Note: In production, verify req.UserID matches authorID
	// For now, we trust the frontend authorization

	_, err = db.Exec("DELETE FROM community.posts WHERE id = $1", req.PostID)
	if err != nil {
		log.Printf("Error deleting post: %v", err)
		http.Error(w, "Failed to delete post", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"success": true}`)
}

func getCommentsHandler(w http.ResponseWriter, r *http.Request) {
	postID := r.URL.Query().Get("postId")
	if postID == "" {
		http.Error(w, "postId is required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(`
		SELECT id, post_id, author_id, author_nickname, author_emoji, content, created_at::text
		FROM community.comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`, postID)
	if err != nil {
		log.Printf("Error querying comments: %v", err)
		http.Error(w, "Failed to fetch comments", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	comments := []Comment{}
	for rows.Next() {
		var comment Comment
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.AuthorID, &comment.AuthorNickname,
			&comment.AuthorEmoji, &comment.Body, &comment.CreatedAt)
		if err != nil {
			log.Printf("Error scanning comment: %v", err)
			continue
		}
		comment.UserID = comment.AuthorID
		comments = append(comments, comment)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

func createCommentHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	commentID := uuid.New().String()
	createdAt := time.Now()

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Insert comment
	_, err = tx.Exec(`
		INSERT INTO community.comments (id, post_id, author_id, author_nickname, author_emoji, content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, commentID, req.PostID, req.UserID, req.AuthorNickname, req.AuthorEmoji, req.Body, createdAt)

	if err != nil {
		log.Printf("Error creating comment: %v", err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	// Update comment count
	_, err = tx.Exec("UPDATE community.posts SET comments = comments + 1 WHERE id = $1", req.PostID)
	if err != nil {
		log.Printf("Error updating comment count: %v", err)
		http.Error(w, "Failed to update comment count", http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	comment := Comment{
		ID:             commentID,
		PostID:         req.PostID,
		AuthorID:       req.UserID,
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Body:           req.Body,
		CreatedAt:      createdAt.Format(time.RFC3339),
		UserID:         req.UserID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(comment)
}

func deleteCommentHandler(w http.ResponseWriter, r *http.Request) {
	var req DeleteCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		http.Error(w, "Failed to delete comment", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Get post_id before deleting
	var postID string
	err = tx.QueryRow("SELECT post_id FROM community.comments WHERE id = $1", req.CommentID).Scan(&postID)
	if err != nil {
		log.Printf("Error finding comment: %v", err)
		http.Error(w, "Comment not found", http.StatusNotFound)
		return
	}

	// Delete comment
	result, err := tx.Exec("DELETE FROM community.comments WHERE id = $1", req.CommentID)
	if err != nil {
		log.Printf("Error deleting comment: %v", err)
		http.Error(w, "Failed to delete comment", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Comment not found", http.StatusNotFound)
		return
	}

	// Update comment count
	_, err = tx.Exec("UPDATE community.posts SET comments = GREATEST(comments - 1, 0) WHERE id = $1", postID)
	if err != nil {
		log.Printf("Error updating comment count: %v", err)
		http.Error(w, "Failed to update comment count", http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Failed to delete comment", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"success": true}`)
}

func likePostHandler(w http.ResponseWriter, r *http.Request) {
	var req LikeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		http.Error(w, "Failed to like post", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Check if already liked
	var exists bool
	err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", req.PostID, req.UserID).Scan(&exists)
	if err != nil {
		log.Printf("Error checking like: %v", err)
		http.Error(w, "Failed to check like status", http.StatusInternalServerError)
		return
	}

	if exists {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success": true, "alreadyLiked": true}`)
		return
	}

	// Insert like
	_, err = tx.Exec(`
		INSERT INTO community.likes (id, post_id, user_id, created_at)
		VALUES ($1, $2, $3, NOW())
	`, uuid.New().String(), req.PostID, req.UserID)

	if err != nil {
		log.Printf("Error liking post: %v", err)
		http.Error(w, "Failed to like post", http.StatusInternalServerError)
		return
	}

	// Update likes count
	_, err = tx.Exec("UPDATE community.posts SET likes = likes + 1 WHERE id = $1", req.PostID)
	if err != nil {
		log.Printf("Error updating like count: %v", err)
		http.Error(w, "Failed to update like count", http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Failed to like post", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"success": true, "alreadyLiked": false}`)
}

func unlikePostHandler(w http.ResponseWriter, r *http.Request) {
	var req UnlikeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		http.Error(w, "Failed to unlike post", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Delete like
	result, err := tx.Exec("DELETE FROM community.likes WHERE post_id = $1 AND user_id = $2", req.PostID, req.UserID)
	if err != nil {
		log.Printf("Error unliking post: %v", err)
		http.Error(w, "Failed to unlike post", http.StatusInternalServerError)
		return
	}

	// Check if any row was deleted
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected: %v", err)
		http.Error(w, "Failed to unlike post", http.StatusInternalServerError)
		return
	}

	// Update likes count only if a row was actually deleted
	if rowsAffected > 0 {
		_, err = tx.Exec("UPDATE community.posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1", req.PostID)
		if err != nil {
			log.Printf("Error updating like count: %v", err)
			http.Error(w, "Failed to update like count", http.StatusInternalServerError)
			return
		}
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Failed to unlike post", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"success": true}`)
}

func checkLikeHandler(w http.ResponseWriter, r *http.Request) {
	postID := r.URL.Query().Get("postId")
	userID := r.URL.Query().Get("userId")
	
	if postID == "" || userID == "" {
		http.Error(w, "postId and userId are required", http.StatusBadRequest)
		return
	}

	var liked bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM community.likes WHERE post_id = $1 AND user_id = $2)", postID, userID).Scan(&liked)
	if err != nil {
		log.Printf("Error checking like: %v", err)
		http.Error(w, "Failed to check like status", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"liked": liked})
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
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

	http.HandleFunc("/community.CommunityService/GetFeed", corsMiddleware(getFeedHandler))
	http.HandleFunc("/community.CommunityService/GetPost", corsMiddleware(getPostHandler))
	http.HandleFunc("/community.CommunityService/CreatePost", corsMiddleware(createPostHandler))
	http.HandleFunc("/community.CommunityService/UpdatePost", corsMiddleware(updatePostHandler))
	http.HandleFunc("/community.CommunityService/DeletePost", corsMiddleware(deletePostHandler))
	http.HandleFunc("/community.CommunityService/GetComments", corsMiddleware(getCommentsHandler))
	http.HandleFunc("/community.CommunityService/CreateComment", corsMiddleware(createCommentHandler))
	http.HandleFunc("/community.CommunityService/DeleteComment", corsMiddleware(deleteCommentHandler))
	http.HandleFunc("/community.CommunityService/LikePost", corsMiddleware(likePostHandler))
	http.HandleFunc("/community.CommunityService/UnlikePost", corsMiddleware(unlikePostHandler))
	http.HandleFunc("/community.CommunityService/CheckLike", corsMiddleware(checkLikeHandler))
	http.HandleFunc("/community.CommunityService/GetNotices", corsMiddleware(getNoticesHandler))
	http.HandleFunc("/community.CommunityService/GetTopDetective", corsMiddleware(getTopDetectiveHandler))
	http.HandleFunc("/community.CommunityService/GetHotTopic", corsMiddleware(getHotTopicHandler))

	log.Printf("Community service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}

func getNoticesHandler(w http.ResponseWriter, r *http.Request) {
	// Get latest 3 posts with '공지' tag
	rows, err := db.Query(`
		SELECT id, title
		FROM community.posts
		WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS t(value) WHERE t.value = '공지')
		ORDER BY created_at DESC
		LIMIT 3
	`)
	if err != nil {
		log.Printf("Error querying notices: %v", err)
		http.Error(w, "Failed to fetch notices", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type Notice struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}

	notices := []Notice{}
	for rows.Next() {
		var notice Notice
		if err := rows.Scan(&notice.ID, &notice.Title); err != nil {
			log.Printf("Error scanning notice: %v", err)
			continue
		}
		notices = append(notices, notice)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notices)
}

func getTopDetectiveHandler(w http.ResponseWriter, r *http.Request) {
	// Get user with most likes this month
	type TopDetective struct {
		AuthorNickname string `json:"authorNickname"`
		AuthorEmoji    string `json:"authorEmoji"`
		TotalLikes     int    `json:"totalLikes"`
	}

	var detective TopDetective
	err := db.QueryRow(`
		SELECT p.author_nickname, p.author_emoji, SUM(p.likes) as total_likes
		FROM community.posts p
		WHERE p.created_at >= DATE_TRUNC('month', NOW())
		GROUP BY p.author_id, p.author_nickname, p.author_emoji
		ORDER BY total_likes DESC
		LIMIT 1
	`).Scan(&detective.AuthorNickname, &detective.AuthorEmoji, &detective.TotalLikes)

	if err == sql.ErrNoRows {
		// No data this month, return empty
		detective = TopDetective{
			AuthorNickname: "아직 없음",
			AuthorEmoji:    "🏆",
			TotalLikes:     0,
		}
	} else if err != nil {
		log.Printf("Error querying top detective: %v", err)
		http.Error(w, "Failed to fetch top detective", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detective)
}

func getHotTopicHandler(w http.ResponseWriter, r *http.Request) {
	// Get most used tag today
	type HotTopic struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
	}

	var topic HotTopic
	err := db.QueryRow(`
		SELECT t.value AS tag, COUNT(*) AS count
		FROM community.posts p,
		     LATERAL jsonb_array_elements_text(p.tags) AS t(value)
		WHERE p.created_at >= CURRENT_DATE
		GROUP BY t.value
		ORDER BY count DESC
		LIMIT 1
	`).Scan(&topic.Tag, &topic.Count)

	if err == sql.ErrNoRows {
		// No posts today, get most popular tag overall
		err = db.QueryRow(`
			SELECT t.value AS tag, COUNT(*) AS count
			FROM community.posts p,
			     LATERAL jsonb_array_elements_text(p.tags) AS t(value)
			GROUP BY t.value
			ORDER BY count DESC
			LIMIT 1
		`).Scan(&topic.Tag, &topic.Count)
	}

	if err == sql.ErrNoRows {
		topic = HotTopic{Tag: "없음", Count: 0}
	} else if err != nil {
		log.Printf("Error querying hot topic: %v", err)
		http.Error(w, "Failed to fetch hot topic", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(topic)
}
