package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// User represents a registered user in the auth schema.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

// UserRepository provides database operations for auth.users.
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a UserRepository backed by the given *sql.DB.
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// CreateUser inserts a new user row and returns the generated UUID.
func (r *UserRepository) CreateUser(ctx context.Context, email, passwordHash string) (string, error) {
	var id string
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO auth.users (id, email, password_hash, created_at)
		 VALUES (gen_random_uuid(), $1, $2, NOW())
		 RETURNING id`,
		email, passwordHash,
	).Scan(&id)
	return id, err
}

// GetUserByEmail looks up a user by email address; returns nil, nil when not found.
func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, password_hash, created_at FROM auth.users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

// GetUserByID looks up a user by primary key; returns nil, nil when not found.
func (r *UserRepository) GetUserByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, password_hash, created_at FROM auth.users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

// HashPassword returns a bcrypt hash of the plaintext password.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 8)
	return string(b), err
}

// CheckPassword reports whether the given plaintext password matches the hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
