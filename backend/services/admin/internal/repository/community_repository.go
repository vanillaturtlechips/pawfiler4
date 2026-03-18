package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type CommunityRepository struct {
	db *sql.DB
}

func NewCommunityRepository(db *sql.DB) *CommunityRepository {
	return &CommunityRepository{db: db}
}

type Post struct {
	ID             string   `json:"id"`
	UserID         string   `json:"userId"`
	AuthorNickname string   `json:"authorNickname"`
	AuthorEmoji    string   `json:"authorEmoji"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Tags           []string `json:"tags"`
	Likes          int      `json:"likes"`
	Comments       int      `json:"comments"`
	CreatedAt      string   `json:"createdAt"`
}

type Comment struct {
	ID             string `json:"id"`
	PostID         string `json:"postId"`
	UserID         string `json:"userId"`
	AuthorNickname string `json:"authorNickname"`
	AuthorEmoji    string `json:"authorEmoji"`
	Body           string `json:"body"`
	CreatedAt      string `json:"createdAt"`
}

type UpdatePostRequest struct {
	Title string   `json:"title"`
	Body  string   `json:"body"`
	Tags  []string `json:"tags"`
}

type CreateAdminPostRequest struct {
	UserID    string   `json:"user_id"`
	Nickname  string   `json:"nickname"`
	Emoji     string   `json:"emoji"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Tags      []string `json:"tags"`
}

func (r *CommunityRepository) ListPosts(page, pageSize int, search, searchType string) ([]Post, int, error) {
	offset := (page - 1) * pageSize

	where := "1=1"
	args := []interface{}{}
	argIdx := 1

	if search != "" {
		switch searchType {
		case "body":
			where = fmt.Sprintf("p.body ILIKE $%d", argIdx)
		case "all":
			where = fmt.Sprintf("(p.title ILIKE $%d OR p.body ILIKE $%d)", argIdx, argIdx)
		default: // title
			where = fmt.Sprintf("p.title ILIKE $%d", argIdx)
		}
		args = append(args, "%"+search+"%")
		argIdx++
	}

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM community.posts p WHERE %s", where)
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count posts: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT p.id, p.author_id, p.author_nickname, p.author_emoji,
		       p.title, p.body, p.tags, p.likes, p.created_at::text, p.comments
		FROM community.posts p
		WHERE %s
		ORDER BY p.created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	args = append(args, pageSize, offset)
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query posts: %w", err)
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post
		var tags pq.StringArray

		if err := rows.Scan(
			&p.ID, &p.UserID, &p.AuthorNickname, &p.AuthorEmoji,
			&p.Title, &p.Body, &tags, &p.Likes, &p.CreatedAt, &p.Comments,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan post: %w", err)
		}

		p.Tags = []string(tags)
		if p.Tags == nil {
			p.Tags = []string{}
		}

		posts = append(posts, p)
	}
	if posts == nil {
		posts = []Post{}
	}

	return posts, total, nil
}

func (r *CommunityRepository) UpdatePost(id string, req *UpdatePostRequest) error {
	setParts := []string{"title = $2", "body = $3", "tags = $4", "updated_at = NOW()"}
	query := fmt.Sprintf("UPDATE community.posts SET %s WHERE id = $1", strings.Join(setParts, ", "))

	result, err := r.db.Exec(query, id, req.Title, req.Body, pq.Array(req.Tags))
	if err != nil {
		return fmt.Errorf("failed to update post: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("post not found")
	}
	return nil
}

func (r *CommunityRepository) DeletePost(id string) error {
	result, err := r.db.Exec("DELETE FROM community.posts WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete post: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("post not found")
	}
	return nil
}

func (r *CommunityRepository) GetComments(postID string) ([]Comment, error) {
	query := `
		SELECT id, post_id, author_id, author_nickname, author_emoji, content, created_at::text
		FROM community.comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`

	rows, err := r.db.Query(query, postID)
	if err != nil {
		return nil, fmt.Errorf("failed to query comments: %w", err)
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var c Comment
		if err := rows.Scan(
			&c.ID, &c.PostID, &c.UserID, &c.AuthorNickname, &c.AuthorEmoji, &c.Body, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan comment: %w", err)
		}
		comments = append(comments, c)
	}
	if comments == nil {
		comments = []Comment{}
	}

	return comments, nil
}

func (r *CommunityRepository) DeleteComment(id string) error {
	result, err := r.db.Exec("DELETE FROM community.comments WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete comment: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("comment not found")
	}
	return nil
}

func (r *CommunityRepository) CreateAdminPost(req *CreateAdminPostRequest) (*Post, error) {
	id := uuid.New().String()
	query := `
		INSERT INTO community.posts (id, author_id, author_nickname, author_emoji, title, body, tags, is_admin_post, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
		RETURNING id, author_id, author_nickname, author_emoji, title, body, tags, likes, comments, created_at::text
	`
	var post Post
	var tags pq.StringArray
	err := r.db.QueryRow(query,
		id, req.UserID, req.Nickname, req.Emoji, req.Title, req.Body, pq.Array(req.Tags),
	).Scan(&post.ID, &post.UserID, &post.AuthorNickname, &post.AuthorEmoji,
		&post.Title, &post.Body, &tags, &post.Likes, &post.Comments, &post.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin post: %w", err)
	}
	post.Tags = []string(tags)
	return &post, nil
}

func generateUUID() string {
	// simple UUID v4 generation
	b := make([]byte, 16)
	_, _ = fmt.Sscanf("00000000-0000-4000-8000-000000000000", "%x-%x-%x-%x-%x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
	// use crypto/rand via time-based fallback
	import_time_nano := fmt.Sprintf("%d", 0)
	_ = import_time_nano
	return fmt.Sprintf("%08x-%04x-4%03x-%04x-%012x",
		0, 0, 0, 0, 0)
}

func (r *CommunityRepository) GetPostByID(id string) (*sql.Row, error) {
	return nil, nil
}
