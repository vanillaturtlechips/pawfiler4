package repository

import (
	"fmt"
	"database/sql"
	"encoding/json"
	"time"
)

// QuestionType represents the type of quiz question
type QuestionType string

const (
	QuestionTypeMultipleChoice QuestionType = "multiple_choice"
	QuestionTypeTrueFalse      QuestionType = "true_false"
	QuestionTypeRegionSelect   QuestionType = "region_select"
	QuestionTypeComparison     QuestionType = "comparison"
)

// MediaType represents the type of media in a question
type MediaType string

const (
	MediaTypeVideo MediaType = "video"
	MediaTypeImage MediaType = "image"
)

// Difficulty represents the difficulty level of a question
type Difficulty string

const (
	DifficultyEasy   Difficulty = "easy"
	DifficultyMedium Difficulty = "medium"
	DifficultyHard   Difficulty = "hard"
)

// Question represents a quiz question with all possible fields for 4 question types
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
type Question struct {
	ID              string       `db:"id"`
	Type            QuestionType `db:"type"`
	MediaType       MediaType    `db:"media_type"`
	MediaURL        string       `db:"media_url"`
	ThumbnailEmoji  string       `db:"thumbnail_emoji"`
	Difficulty      Difficulty   `db:"difficulty"`
	Category        string       `db:"category"`
	Explanation     string       `db:"explanation"`
	CreatedAt       time.Time    `db:"created_at"`
	UpdatedAt       time.Time    `db:"updated_at"`

	// Multiple Choice fields (Requirement 2.3)
	Options      []string       `db:"options"`
	CorrectIndex sql.NullInt32  `db:"correct_index"`

	// True/False fields (Requirement 2.4)
	CorrectAnswer sql.NullBool `db:"correct_answer"`

	// Region Select fields (Requirement 2.5)
	CorrectRegions []Region      `db:"correct_regions"`
	Tolerance      sql.NullInt32 `db:"tolerance"`

	// Comparison fields (Requirement 2.6)
	ComparisonMediaURL sql.NullString `db:"comparison_media_url"`
	CorrectSide        sql.NullString `db:"correct_side"`
}

// Region represents a circular region with center point and radius
// Used for Region Select questions (Requirement 2.5)
type Region struct {
	X      int32 `json:"x"`
	Y      int32 `json:"y"`
	Radius int32 `json:"radius"`
}

// Point represents a 2D coordinate point
// Used for user's selected region in Region Select questions
type Point struct {
	X int32 `json:"x"`
	Y int32 `json:"y"`
}

// UserAnswer represents a user's answer to a question
// Requirements: 2.7, 2.8
type UserAnswer struct {
	ID           string                 `db:"id"`
	UserID       string                 `db:"user_id"`
	QuestionID   string                 `db:"question_id"`
	AnswerData   map[string]interface{} `db:"answer_data"` // JSONB field
	IsCorrect    bool                   `db:"is_correct"`
	XPEarned     int32                  `db:"xp_earned"`
	CoinsEarned  int32                  `db:"coins_earned"`
	AnsweredAt   time.Time              `db:"answered_at"`
}

// UserStats represents a user's quiz statistics
// Requirements: 2.9, 2.10
type UserStats struct {
	UserID        string    `db:"user_id"`
	TotalAnswered int32     `db:"total_answered"`
	CorrectCount  int32     `db:"correct_count"`
	CurrentStreak int32     `db:"current_streak"`
	BestStreak    int32     `db:"best_streak"`
	Lives         int32     `db:"lives"`
	UpdatedAt     time.Time `db:"updated_at"`
}

// CorrectRate calculates the user's correct answer rate
// Returns a value between 0.0 and 1.0
// Requirement: 11.7
func (s *UserStats) CorrectRate() float64 {
	if s.TotalAnswered == 0 {
		return 0.0
	}
	return float64(s.CorrectCount) / float64(s.TotalAnswered)
}

// Answer is an interface for all answer types
// Each question type has its own answer implementation
type Answer interface {
	isAnswer()
	ToJSON() (map[string]interface{}, error)
}

// MultipleChoiceAnswer represents an answer to a multiple choice question
// Requirement: 5.1
type MultipleChoiceAnswer struct {
	SelectedIndex int32 `json:"selected_index"`
}

func (a MultipleChoiceAnswer) isAnswer() {}

func (a MultipleChoiceAnswer) ToJSON() (map[string]interface{}, error) {
	return map[string]interface{}{
		"selected_index": a.SelectedIndex,
	}, nil
}

// TrueFalseAnswer represents an answer to a true/false question
// Requirement: 6.1
type TrueFalseAnswer struct {
	SelectedAnswer bool `json:"selected_answer"`
}

func (a TrueFalseAnswer) isAnswer() {}

func (a TrueFalseAnswer) ToJSON() (map[string]interface{}, error) {
	return map[string]interface{}{
		"selected_answer": a.SelectedAnswer,
	}, nil
}

// RegionSelectAnswer represents an answer to a region select question
// Requirement: 7.1
type RegionSelectAnswer struct {
	SelectedRegion Point `json:"selected_region"`
}

func (a RegionSelectAnswer) isAnswer() {}

func (a RegionSelectAnswer) ToJSON() (map[string]interface{}, error) {
	return map[string]interface{}{
		"selected_region": map[string]interface{}{
			"x": a.SelectedRegion.X,
			"y": a.SelectedRegion.Y,
		},
	}, nil
}

// ComparisonAnswer represents an answer to a comparison question
// Requirement: 8.1
type ComparisonAnswer struct {
	SelectedSide string `json:"selected_side"` // "left" or "right"
}

func (a ComparisonAnswer) isAnswer() {}

func (a ComparisonAnswer) ToJSON() (map[string]interface{}, error) {
	return map[string]interface{}{
		"selected_side": a.SelectedSide,
	}, nil
}

// UserProfile stores gamification data for a user including XP, coins, and energy.
// Energy is consumed when requesting questions and recovers automatically over time.
type UserProfile struct {
	UserID           string    `db:"user_id"`
	TotalExp         int32     `db:"total_exp"`
	TotalCoins       int32     `db:"total_coins"`
	CurrentTier      string    `db:"current_tier"`
	Energy           int32     `db:"energy"`
	MaxEnergy        int32     `db:"max_energy"`
	LastEnergyRefill time.Time `db:"last_energy_refill"`
	UpdatedAt        time.Time `db:"updated_at"`
}

// Level returns the user's tier level (1-5) based on total XP.
func (p *UserProfile) Level() int32 {
	exp := p.TotalExp
	tier := p.Tier()
	
	switch tier {
	case "불사조":
		switch {
		case exp >= 2000: return 5
		case exp >= 1500: return 4
		case exp >= 1000: return 3
		case exp >= 500: return 2
		default: return 1
		}
	case "맹금닭":
		switch {
		case exp >= 800: return 5
		case exp >= 600: return 4
		case exp >= 400: return 3
		case exp >= 200: return 2
		default: return 1
		}
	case "삐약이":
		switch {
		case exp >= 80: return 5
		case exp >= 60: return 4
		case exp >= 40: return 3
		case exp >= 20: return 2
		default: return 1
		}
	default: // 알
		switch {
		case exp >= 8: return 5
		case exp >= 6: return 4
		case exp >= 4: return 3
		case exp >= 2: return 2
		default: return 1
		}
	}
}

func (p *UserProfile) Tier() string {
	if p.CurrentTier == "" {
		return "알"
	}
	return p.CurrentTier
}

// TierName returns the Korean display name for the user's current tier.
func (p *UserProfile) TierName() string {
	return fmt.Sprintf("%s Lv.%d", p.Tier(), p.Level())
}

// RefillEnergy applies time-based energy recovery (+10 per 3 hours elapsed since
// LastEnergyRefill) and caps the result at MaxEnergy. The LastEnergyRefill timestamp
// is advanced by the number of full 3-hour intervals consumed so that partial hours
// carry over to the next call.
func (p *UserProfile) RefillEnergy() {
	hoursElapsed := time.Since(p.LastEnergyRefill).Hours()
	intervals := int32(hoursElapsed / 3)
	if intervals <= 0 {
		return
	}
	refillAmount := intervals * 10
	p.Energy += refillAmount
	if p.Energy > p.MaxEnergy {
		p.Energy = p.MaxEnergy
	}
	// Advance the timestamp by the number of full intervals consumed.
	p.LastEnergyRefill = p.LastEnergyRefill.Add(time.Duration(intervals) * 3 * time.Hour)
}

// Helper functions for JSONB handling

// MarshalRegions converts a slice of Region to JSON bytes for database storage
func MarshalRegions(regions []Region) ([]byte, error) {
	if regions == nil {
		return nil, nil
	}
	return json.Marshal(regions)
}

// UnmarshalRegions converts JSON bytes from database to a slice of Region
func UnmarshalRegions(data []byte) ([]Region, error) {
	if data == nil {
		return nil, nil
	}
	var regions []Region
	err := json.Unmarshal(data, &regions)
	return regions, err
}

// MarshalAnswerData converts an Answer to a map for JSONB storage
func MarshalAnswerData(answer Answer) (map[string]interface{}, error) {
	return answer.ToJSON()
}

// XPRewardByDifficulty returns the XP and coin rewards for a correct answer based on difficulty
func XPRewardByDifficulty(difficulty Difficulty) (xp int32, coins int32) {
	switch difficulty {
	case DifficultyHard:
		return 50, 25
	case DifficultyMedium:
		return 25, 12
	default: // easy
		return 10, 5
	}
}
