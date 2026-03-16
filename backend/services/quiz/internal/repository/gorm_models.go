package repository

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// GORM 모델 정의 - 기존 모델과 호환성 유지

// GormQuestion GORM용 Question 모델
type GormQuestion struct {
	ID              string       `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Type            QuestionType `gorm:"type:varchar(50);not null" json:"type"`
	MediaType       MediaType    `gorm:"type:varchar(20);not null" json:"media_type"`
	MediaURL        string       `gorm:"type:text;not null" json:"media_url"`
	ThumbnailEmoji  string       `gorm:"type:varchar(10);not null" json:"thumbnail_emoji"`
	Difficulty      Difficulty   `gorm:"type:varchar(20);not null" json:"difficulty"`
	Category        string       `gorm:"type:varchar(100);not null" json:"category"`
	Explanation     string       `gorm:"type:text;not null" json:"explanation"`
	CreatedAt       time.Time    `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time    `gorm:"autoUpdateTime" json:"updated_at"`

	// Multiple Choice fields
	Options      StringArray `gorm:"type:text[]" json:"options"`
	CorrectIndex *int32      `gorm:"type:integer" json:"correct_index"`

	// True/False fields
	CorrectAnswer *bool `gorm:"type:boolean" json:"correct_answer"`

	// Region Select fields
	CorrectRegions RegionArray `gorm:"type:jsonb" json:"correct_regions"`
	Tolerance      *int32      `gorm:"type:integer" json:"tolerance"`

	// Comparison fields
	ComparisonMediaURL *string `gorm:"type:text" json:"comparison_media_url"`
	CorrectSide        *string `gorm:"type:varchar(10)" json:"correct_side"`
}

// TableName GORM 테이블 이름 지정
func (GormQuestion) TableName() string {
	return "quiz.questions"
}

// ToQuestion GORM 모델을 기존 Question 모델로 변환
func (gq *GormQuestion) ToQuestion() *Question {
	q := &Question{
		ID:             gq.ID,
		Type:           gq.Type,
		MediaType:      gq.MediaType,
		MediaURL:       gq.MediaURL,
		ThumbnailEmoji: gq.ThumbnailEmoji,
		Difficulty:     gq.Difficulty,
		Category:       gq.Category,
		Explanation:    gq.Explanation,
		CreatedAt:      gq.CreatedAt,
		UpdatedAt:      gq.UpdatedAt,
		Options:        []string(gq.Options),
		CorrectRegions: []Region(gq.CorrectRegions),
	}

	// Nullable 필드 처리
	if gq.CorrectIndex != nil {
		q.CorrectIndex.Valid = true
		q.CorrectIndex.Int32 = *gq.CorrectIndex
	}

	if gq.CorrectAnswer != nil {
		q.CorrectAnswer.Valid = true
		q.CorrectAnswer.Bool = *gq.CorrectAnswer
	}

	if gq.Tolerance != nil {
		q.Tolerance.Valid = true
		q.Tolerance.Int32 = *gq.Tolerance
	}

	if gq.ComparisonMediaURL != nil {
		q.ComparisonMediaURL.Valid = true
		q.ComparisonMediaURL.String = *gq.ComparisonMediaURL
	}

	if gq.CorrectSide != nil {
		q.CorrectSide.Valid = true
		q.CorrectSide.String = *gq.CorrectSide
	}

	return q
}

// GormUserAnswer GORM용 UserAnswer 모델
type GormUserAnswer struct {
	ID          string                 `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      string                 `gorm:"type:uuid;not null;index" json:"user_id"`
	QuestionID  string                 `gorm:"type:uuid;not null;index" json:"question_id"`
	AnswerData  map[string]interface{} `gorm:"type:jsonb;not null" json:"answer_data"`
	IsCorrect   bool                   `gorm:"not null" json:"is_correct"`
	XPEarned    int32                  `gorm:"default:0" json:"xp_earned"`
	CoinsEarned int32                  `gorm:"default:0" json:"coins_earned"`
	AnsweredAt  time.Time              `gorm:"default:now()" json:"answered_at"`

	// 관계 설정
	Question *GormQuestion `gorm:"foreignKey:QuestionID;references:ID" json:"question,omitempty"`
}

// TableName GORM 테이블 이름 지정
func (GormUserAnswer) TableName() string {
	return "quiz.user_answers"
}

// ToUserAnswer GORM 모델을 기존 UserAnswer 모델로 변환
func (gua *GormUserAnswer) ToUserAnswer() *UserAnswer {
	return &UserAnswer{
		ID:          gua.ID,
		UserID:      gua.UserID,
		QuestionID:  gua.QuestionID,
		AnswerData:  gua.AnswerData,
		IsCorrect:   gua.IsCorrect,
		XPEarned:    gua.XPEarned,
		CoinsEarned: gua.CoinsEarned,
		AnsweredAt:  gua.AnsweredAt,
	}
}

// FromUserAnswer 기존 UserAnswer 모델을 GORM 모델로 변환
func (gua *GormUserAnswer) FromUserAnswer(ua *UserAnswer) {
	gua.ID = ua.ID
	gua.UserID = ua.UserID
	gua.QuestionID = ua.QuestionID
	gua.AnswerData = ua.AnswerData
	gua.IsCorrect = ua.IsCorrect
	gua.XPEarned = ua.XPEarned
	gua.CoinsEarned = ua.CoinsEarned
	gua.AnsweredAt = ua.AnsweredAt
}

// GormUserStats GORM용 UserStats 모델
type GormUserStats struct {
	UserID        string    `gorm:"primaryKey;type:uuid" json:"user_id"`
	TotalAnswered int32     `gorm:"default:0" json:"total_answered"`
	CorrectCount  int32     `gorm:"default:0" json:"correct_count"`
	CurrentStreak int32     `gorm:"default:0" json:"current_streak"`
	BestStreak    int32     `gorm:"default:0" json:"best_streak"`
	Lives         int32     `gorm:"default:3" json:"lives"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName GORM 테이블 이름 지정
func (GormUserStats) TableName() string {
	return "quiz.user_stats"
}

// ToUserStats GORM 모델을 기존 UserStats 모델로 변환
func (gus *GormUserStats) ToUserStats() *UserStats {
	return &UserStats{
		UserID:        gus.UserID,
		TotalAnswered: gus.TotalAnswered,
		CorrectCount:  gus.CorrectCount,
		CurrentStreak: gus.CurrentStreak,
		BestStreak:    gus.BestStreak,
		Lives:         gus.Lives,
		UpdatedAt:     gus.UpdatedAt,
	}
}

// FromUserStats 기존 UserStats 모델을 GORM 모델로 변환
func (gus *GormUserStats) FromUserStats(us *UserStats) {
	gus.UserID = us.UserID
	gus.TotalAnswered = us.TotalAnswered
	gus.CorrectCount = us.CorrectCount
	gus.CurrentStreak = us.CurrentStreak
	gus.BestStreak = us.BestStreak
	gus.Lives = us.Lives
	gus.UpdatedAt = us.UpdatedAt
}

// CorrectRate 정확도 계산
func (gus *GormUserStats) CorrectRate() float64 {
	if gus.TotalAnswered == 0 {
		return 0.0
	}
	return float64(gus.CorrectCount) / float64(gus.TotalAnswered)
}


// 커스텀 타입 정의 - PostgreSQL 배열 및 JSONB 지원

// StringArray PostgreSQL text[] 타입 지원
type StringArray []string

// Scan database/sql Scanner 인터페이스 구현
func (sa *StringArray) Scan(value interface{}) error {
	if value == nil {
		*sa = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		// PostgreSQL text[] 배열 형식: {option1,option2,option3}
		str := string(v)
		if str == "{}" {
			*sa = []string{}
			return nil
		}
		// {} 제거하고 쉼표로 분리
		if len(str) > 2 && str[0] == '{' && str[len(str)-1] == '}' {
			str = str[1 : len(str)-1]
			if str == "" {
				*sa = []string{}
				return nil
			}
			*sa = strings.Split(str, ",")
			return nil
		}
		return fmt.Errorf("invalid PostgreSQL array format: %s", str)
	case string:
		// PostgreSQL text[] 배열 형식: {option1,option2,option3}
		if v == "{}" {
			*sa = []string{}
			return nil
		}
		// {} 제거하고 쉼표로 분리
		if len(v) > 2 && v[0] == '{' && v[len(v)-1] == '}' {
			str := v[1 : len(v)-1]
			if str == "" {
				*sa = []string{}
				return nil
			}
			*sa = strings.Split(str, ",")
			return nil
		}
		return fmt.Errorf("invalid PostgreSQL array format: %s", v)
	default:
		return fmt.Errorf("cannot scan %T into StringArray", value)
	}
}

// Value database/sql/driver Valuer 인터페이스 구현
func (sa StringArray) Value() (driver.Value, error) {
	if sa == nil {
		return nil, nil
	}
	return json.Marshal(sa)
}

// RegionArray PostgreSQL jsonb 타입으로 Region 배열 지원
type RegionArray []Region

// Scan database/sql Scanner 인터페이스 구현
func (ra *RegionArray) Scan(value interface{}) error {
	if value == nil {
		*ra = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, ra)
	case string:
		return json.Unmarshal([]byte(v), ra)
	default:
		return fmt.Errorf("cannot scan %T into RegionArray", value)
	}
}

// Value database/sql/driver Valuer 인터페이스 구현
func (ra RegionArray) Value() (driver.Value, error) {
	if ra == nil {
		return nil, nil
	}
	return json.Marshal(ra)
}

// GormUserProfile GORM용 UserProfile 모델 (XP, 코인, 에너지)
type GormUserProfile struct {
	UserID         string    `gorm:"primaryKey;type:uuid" json:"user_id"`
	Nickname       string    `gorm:"column:nickname;default:''" json:"nickname"`
	AvatarEmoji    string    `gorm:"column:avatar_emoji;default:'🥚'" json:"avatar_emoji"`
	TotalExp       int32     `gorm:"default:0" json:"total_exp"`
	TotalCoins     int32     `gorm:"default:0" json:"total_coins"`
	CurrentTier    string    `gorm:"default:알" json:"current_tier"`
	Energy         int32     `gorm:"default:100" json:"energy"`
	MaxEnergy      int32     `gorm:"default:100" json:"max_energy"`
	LastEnergyRefill time.Time `gorm:"column:last_energy_refill;default:now()" json:"last_energy_refill"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName GORM 테이블 이름 지정
func (GormUserProfile) TableName() string { return "quiz.user_profiles" }

// ToUserProfile GORM 모델을 기존 UserProfile 모델로 변환
func (gup *GormUserProfile) ToUserProfile() *UserProfile {
	return &UserProfile{
		UserID:           gup.UserID,
		Nickname:         gup.Nickname,
		AvatarEmoji:      gup.AvatarEmoji,
		TotalExp:         gup.TotalExp,
		TotalCoins:       gup.TotalCoins,
		CurrentTier:      gup.CurrentTier,
		Energy:           gup.Energy,
		MaxEnergy:        gup.MaxEnergy,
		LastEnergyRefill: gup.LastEnergyRefill,
	}
}

// FromUserProfile 기존 UserProfile 모델을 GORM 모델로 변환
func (gup *GormUserProfile) FromUserProfile(p *UserProfile) {
	gup.UserID = p.UserID
	gup.Nickname = p.Nickname
	gup.AvatarEmoji = p.AvatarEmoji
	gup.TotalExp = p.TotalExp
	gup.TotalCoins = p.TotalCoins
	gup.CurrentTier = p.CurrentTier
	gup.Energy = p.Energy
	gup.MaxEnergy = p.MaxEnergy
	gup.LastEnergyRefill = p.LastEnergyRefill
}
