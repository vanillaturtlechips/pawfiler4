package repository

import (
	"database/sql"
	"fmt"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

type User struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	Nickname         string `json:"nickname"`
	AvatarEmoji      string `json:"avatarEmoji"`
	SubscriptionType string `json:"subscriptionType"`
	Coins            int    `json:"coins"`
	Level            int    `json:"level"`
	LevelTitle       string `json:"levelTitle"`
	XP               int    `json:"xp"`
	CreatedAt        string `json:"createdAt"`
}

func (r *UserRepository) ListUsers(page, pageSize int, search string) ([]User, int, error) {
	offset := (page - 1) * pageSize

	where := "1=1"
	args := []interface{}{}
	argIdx := 1

	if search != "" {
		where = fmt.Sprintf("(email ILIKE $%d OR nickname ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	var total int
	if err := r.db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM auth.users WHERE %s", where), args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT id, email, nickname, avatar_emoji, subscription_type, coins, level, level_title, xp, created_at::text
		FROM auth.users
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	args = append(args, pageSize, offset)
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Nickname, &u.AvatarEmoji, &u.SubscriptionType, &u.Coins, &u.Level, &u.LevelTitle, &u.XP, &u.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	if users == nil {
		users = []User{}
	}
	return users, total, nil
}

func (r *UserRepository) DeleteUser(id string) error {
	result, err := r.db.Exec("DELETE FROM auth.users WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (r *UserRepository) UpdateSubscription(id, subType string) error {
	result, err := r.db.Exec("UPDATE auth.users SET subscription_type = $2, updated_at = NOW() WHERE id = $1", id, subType)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}
