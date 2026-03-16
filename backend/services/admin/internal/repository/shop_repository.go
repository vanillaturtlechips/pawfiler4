package repository

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type ShopRepository struct {
	db *sql.DB
}

func NewShopRepository(db *sql.DB) *ShopRepository {
	return &ShopRepository{db: db}
}

type ShopItem struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       int       `json:"price"`
	Icon        string    `json:"icon"`
	Badge       *string   `json:"badge,omitempty"`
	Type        string    `json:"type"`
	Quantity    int       `json:"quantity"`
	Bonus       int       `json:"bonus"`
	IsActive    bool      `json:"is_active"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateShopItemRequest struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       int     `json:"price"`
	Icon        string  `json:"icon"`
	Badge       *string `json:"badge,omitempty"`
	Type        string  `json:"type"`
	Quantity    int     `json:"quantity"`
	Bonus       int     `json:"bonus"`
	IsActive    bool    `json:"is_active"`
	SortOrder   int     `json:"sort_order"`
}

type UpdateShopItemRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Price       *int    `json:"price,omitempty"`
	Icon        *string `json:"icon,omitempty"`
	Badge       *string `json:"badge,omitempty"`
	Type        *string `json:"type,omitempty"`
	Quantity    *int    `json:"quantity,omitempty"`
	Bonus       *int    `json:"bonus,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
	SortOrder   *int    `json:"sort_order,omitempty"`
}

func (r *ShopRepository) ListShopItems() ([]ShopItem, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, price, icon, badge, type, quantity, bonus, is_active, sort_order, created_at, updated_at
		FROM user_svc.shop_items
		ORDER BY type, sort_order ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ShopItem
	for rows.Next() {
		var item ShopItem
		if err := rows.Scan(
			&item.ID, &item.Name, &item.Description, &item.Price,
			&item.Icon, &item.Badge, &item.Type, &item.Quantity,
			&item.Bonus, &item.IsActive, &item.SortOrder,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if items == nil {
		items = []ShopItem{}
	}
	return items, nil
}

func (r *ShopRepository) GetShopItem(id string) (*ShopItem, error) {
	var item ShopItem
	err := r.db.QueryRow(`
		SELECT id, name, description, price, icon, badge, type, quantity, bonus, is_active, sort_order, created_at, updated_at
		FROM user_svc.shop_items WHERE id = $1
	`, id).Scan(
		&item.ID, &item.Name, &item.Description, &item.Price,
		&item.Icon, &item.Badge, &item.Type, &item.Quantity,
		&item.Bonus, &item.IsActive, &item.SortOrder,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &item, err
}

func (r *ShopRepository) CreateShopItem(req *CreateShopItemRequest) (*ShopItem, error) {
	id := req.ID
	if id == "" {
		id = uuid.New().String()
	}
	now := time.Now()
	_, err := r.db.Exec(`
		INSERT INTO user_svc.shop_items
			(id, name, description, price, icon, badge, type, quantity, bonus, is_active, sort_order, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`, id, req.Name, req.Description, req.Price, req.Icon, req.Badge,
		req.Type, req.Quantity, req.Bonus, req.IsActive, req.SortOrder, now, now)
	if err != nil {
		return nil, err
	}
	return r.GetShopItem(id)
}

func (r *ShopRepository) UpdateShopItem(id string, req *UpdateShopItemRequest) (*ShopItem, error) {
	_, err := r.db.Exec(`
		UPDATE user_svc.shop_items SET
			name        = COALESCE($2, name),
			description = COALESCE($3, description),
			price       = COALESCE($4, price),
			icon        = COALESCE($5, icon),
			badge       = $6,
			type        = COALESCE($7, type),
			quantity    = COALESCE($8, quantity),
			bonus       = COALESCE($9, bonus),
			is_active   = COALESCE($10, is_active),
			sort_order  = COALESCE($11, sort_order),
			updated_at  = NOW()
		WHERE id = $1
	`, id, req.Name, req.Description, req.Price, req.Icon, req.Badge,
		req.Type, req.Quantity, req.Bonus, req.IsActive, req.SortOrder)
	if err != nil {
		return nil, err
	}
	return r.GetShopItem(id)
}

func (r *ShopRepository) DeleteShopItem(id string) error {
	_, err := r.db.Exec(`DELETE FROM user_svc.shop_items WHERE id = $1`, id)
	return err
}
