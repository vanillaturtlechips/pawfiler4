package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type QuizRepository struct {
	db *sql.DB
}

func NewQuizRepository(db *sql.DB) *QuizRepository {
	return &QuizRepository{db: db}
}

type Region struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Radius int `json:"radius"`
}

type Question struct {
	ID                 string         `json:"id"`
	Type               string         `json:"type"`
	MediaType          string         `json:"media_type"`
	MediaURL           string         `json:"media_url"`
	ThumbnailEmoji     string         `json:"thumbnail_emoji"`
	Difficulty         string         `json:"difficulty"`
	Category           string         `json:"category"`
	Explanation        string         `json:"explanation"`
	Status             string         `json:"status"`
	Options            []string       `json:"options,omitempty"`
	CorrectIndex       *int           `json:"correct_index,omitempty"`
	CorrectAnswer      *bool          `json:"correct_answer,omitempty"`
	CorrectRegions     json.RawMessage `json:"correct_regions,omitempty"`
	Tolerance          *float64       `json:"tolerance,omitempty"`
	ComparisonMediaURL *string        `json:"comparison_media_url,omitempty"`
	CorrectSide        *string        `json:"correct_side,omitempty"`
}

type CreateQuestionRequest struct {
	Type               string          `json:"type"`
	MediaType          string          `json:"media_type"`
	MediaURL           string          `json:"media_url"`
	ThumbnailEmoji     string          `json:"thumbnail_emoji"`
	Difficulty         string          `json:"difficulty"`
	Category           string          `json:"category"`
	Explanation        string          `json:"explanation"`
	Status             string          `json:"status"` // "active" | "pending"
	Options            []string        `json:"options,omitempty"`
	CorrectIndex       *int            `json:"correct_index,omitempty"`
	CorrectAnswer      *bool           `json:"correct_answer,omitempty"`
	CorrectRegions     []Region        `json:"correct_regions,omitempty"`
	Tolerance          *int            `json:"tolerance,omitempty"`
	ComparisonMediaURL *string         `json:"comparison_media_url,omitempty"`
	CorrectSide        *string         `json:"correct_side,omitempty"`
}

type ListQuestionsFilter struct {
	Type       string
	Difficulty string
	Category   string
	Search     string
}

func (r *QuizRepository) ListQuestions(limit, offset int, f ListQuestionsFilter) ([]Question, int, error) {
	args := []interface{}{}
	argIdx := 1
	where := "1=1"

	if f.Type != "" {
		where += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, f.Type)
		argIdx++
	}
	if f.Difficulty != "" {
		where += fmt.Sprintf(" AND difficulty = $%d", argIdx)
		args = append(args, f.Difficulty)
		argIdx++
	}
	if f.Category != "" {
		where += fmt.Sprintf(" AND category = $%d", argIdx)
		args = append(args, f.Category)
		argIdx++
	}
	if f.Search != "" {
		where += fmt.Sprintf(" AND explanation ILIKE $%d", argIdx)
		args = append(args, "%"+f.Search+"%")
		argIdx++
	}

	var total int
	if err := r.db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM quiz.questions WHERE %s", where), args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count questions: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT id, type, media_type, media_url, thumbnail_emoji, difficulty, category, 
		       explanation, options, correct_index, correct_answer, correct_regions, 
		       tolerance, comparison_media_url, correct_side
		FROM quiz.questions
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query questions: %w", err)
	}
	defer rows.Close()

	var questions []Question
	for rows.Next() {
		var q Question
		var options pq.StringArray
		var correctRegions []byte

		err := rows.Scan(
			&q.ID, &q.Type, &q.MediaType, &q.MediaURL, &q.ThumbnailEmoji,
			&q.Difficulty, &q.Category, &q.Explanation, &options,
			&q.CorrectIndex, &q.CorrectAnswer, &correctRegions,
			&q.Tolerance, &q.ComparisonMediaURL, &q.CorrectSide,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan question: %w", err)
		}

		q.Options = options
		if len(correctRegions) > 0 {
			q.CorrectRegions = correctRegions
		}

		questions = append(questions, q)
	}

	return questions, total, nil
}

func (r *QuizRepository) GetQuestion(id string) (*Question, error) {
	query := `
		SELECT id, type, media_type, media_url, thumbnail_emoji, difficulty, category, 
		       explanation, options, correct_index, correct_answer, correct_regions, 
		       tolerance, comparison_media_url, correct_side
		FROM quiz.questions
		WHERE id = $1
	`

	var q Question
	var options pq.StringArray
	var correctRegions []byte

	err := r.db.QueryRow(query, id).Scan(
		&q.ID, &q.Type, &q.MediaType, &q.MediaURL, &q.ThumbnailEmoji,
		&q.Difficulty, &q.Category, &q.Explanation, &options,
		&q.CorrectIndex, &q.CorrectAnswer, &correctRegions,
		&q.Tolerance, &q.ComparisonMediaURL, &q.CorrectSide,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("question not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get question: %w", err)
	}

	q.Options = options
	if len(correctRegions) > 0 {
		q.CorrectRegions = correctRegions
	}

	return &q, nil
}

func (r *QuizRepository) CreateQuestion(req *CreateQuestionRequest) (*Question, error) {
	id := uuid.New().String()

	if req.Status == "" {
		req.Status = "active"
	}

	query := `
		INSERT INTO quiz.questions (
			id, type, media_type, media_url, thumbnail_emoji, difficulty, category,
			explanation, options, correct_index, correct_answer, correct_regions,
			tolerance, comparison_media_url, correct_side, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
	`

	var correctRegions json.RawMessage
	if len(req.CorrectRegions) > 0 {
		regionsJSON, err := json.Marshal(req.CorrectRegions)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal correct_regions: %w", err)
		}
		correctRegions = regionsJSON
	} else {
		correctRegions = json.RawMessage("null")
	}

	_, err := r.db.Exec(query,
		id, req.Type, req.MediaType, req.MediaURL, req.ThumbnailEmoji,
		req.Difficulty, req.Category, req.Explanation, pq.Array(req.Options),
		req.CorrectIndex, req.CorrectAnswer, correctRegions,
		req.Tolerance, req.ComparisonMediaURL, req.CorrectSide, req.Status,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create question: %w", err)
	}

	return r.GetQuestion(id)
}

func (r *QuizRepository) UpdateQuestion(id string, req *CreateQuestionRequest) (*Question, error) {
	query := `
		UPDATE quiz.questions SET
			type = $2, media_type = $3, media_url = $4, thumbnail_emoji = $5,
			difficulty = $6, category = $7, explanation = $8, options = $9,
			correct_index = $10, correct_answer = $11, correct_regions = $12,
			tolerance = $13, comparison_media_url = $14, correct_side = $15
		WHERE id = $1
	`

	// Convert CorrectRegions to JSON
	var correctRegions json.RawMessage
	if len(req.CorrectRegions) > 0 {
		regionsJSON, err := json.Marshal(req.CorrectRegions)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal correct_regions: %w", err)
		}
		correctRegions = regionsJSON
	} else {
		correctRegions = json.RawMessage("null")
	}

	result, err := r.db.Exec(query,
		id, req.Type, req.MediaType, req.MediaURL, req.ThumbnailEmoji,
		req.Difficulty, req.Category, req.Explanation, pq.Array(req.Options),
		req.CorrectIndex, req.CorrectAnswer, correctRegions,
		req.Tolerance, req.ComparisonMediaURL, req.CorrectSide,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update question: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return nil, fmt.Errorf("question not found")
	}

	return r.GetQuestion(id)
}

func (r *QuizRepository) DeleteQuestion(id string) error {
	result, err := r.db.Exec("DELETE FROM quiz.questions WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete question: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("question not found")
	}

	return nil
}
