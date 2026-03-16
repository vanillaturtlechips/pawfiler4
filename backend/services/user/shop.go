package main

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type ShopItem struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       int     `json:"price"`
	Icon        string  `json:"icon"`
	Badge       *string `json:"badge,omitempty"`
	Type        string  `json:"type"`
	Quantity    int     `json:"quantity,omitempty"`
	Bonus       int     `json:"bonus,omitempty"`
}

// handleGetShopItems returns all shop item categories from DB.
func handleGetShopItems(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	ctx := r.Context()
	rows, err := db.QueryContext(ctx, `
		SELECT id, name, description, price, icon, badge, type, quantity, bonus
		FROM user_svc.shop_items
		WHERE is_active = true
		ORDER BY sort_order ASC
	`)
	if err != nil {
		log.Printf("error fetching shop items: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	var subscriptions, coins, packages []ShopItem
	for rows.Next() {
		var item ShopItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.Price,
			&item.Icon, &item.Badge, &item.Type, &item.Quantity, &item.Bonus); err != nil {
			continue
		}
		switch item.Type {
		case "subscription":
			subscriptions = append(subscriptions, item)
		case "coins":
			coins = append(coins, item)
		default:
			packages = append(packages, item)
		}
	}

	if subscriptions == nil {
		subscriptions = []ShopItem{}
	}
	if coins == nil {
		coins = []ShopItem{}
	}
	if packages == nil {
		packages = []ShopItem{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"subscriptions": subscriptions,
		"coin_packages": coins,
		"packages":      packages,
	})
}

// handlePurchaseItem validates coins, deducts them and records the purchase.
func handlePurchaseItem(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	var req struct {
		UserID string `json:"user_id"`
		ItemID string `json:"item_id"`
	}
	if err := readJSON(r, &req); err != nil || req.UserID == "" || req.ItemID == "" {
		writeError(w, http.StatusBadRequest, "user_id and item_id required")
		return
	}

	ctx := r.Context()

	// Look up item from DB
	var item ShopItem
	err := db.QueryRowContext(ctx, `
		SELECT id, name, description, price, icon, badge, type, quantity, bonus
		FROM user_svc.shop_items
		WHERE id = $1 AND is_active = true
	`, req.ItemID).Scan(&item.ID, &item.Name, &item.Description, &item.Price,
		&item.Icon, &item.Badge, &item.Type, &item.Quantity, &item.Bonus)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		log.Printf("error fetching item: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("error starting tx: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer tx.Rollback()

	// Get current coins (UPSERT user_profiles if not exist)
	var totalCoins int
	err = tx.QueryRowContext(ctx,
		`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`,
		req.UserID,
	).Scan(&totalCoins)
	if err != nil {
		// User has no profile yet — insert with defaults then re-fetch
		_, err = tx.ExecContext(ctx, `
			INSERT INTO quiz.user_profiles (user_id, total_exp, total_coins, energy, max_energy, last_energy_refill, updated_at)
			VALUES ($1, 0, 0, 100, 100, NOW(), NOW())
			ON CONFLICT (user_id) DO NOTHING
		`, req.UserID)
		if err != nil {
			log.Printf("error inserting user_profiles: %v", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		// Re-fetch to get actual coins (handles race where row already existed)
		if err = tx.QueryRowContext(ctx,
			`SELECT total_coins FROM quiz.user_profiles WHERE user_id = $1 FOR UPDATE`,
			req.UserID,
		).Scan(&totalCoins); err != nil {
			log.Printf("error re-fetching user_profiles: %v", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	if totalCoins < item.Price {
		writeJSON(w, http.StatusPaymentRequired, map[string]interface{}{
			"error":       "코인이 부족합니다",
			"total_coins": totalCoins,
			"required":    item.Price,
		})
		return
	}

	newCoins := totalCoins - item.Price

	// Deduct coins
	_, err = tx.ExecContext(ctx,
		`UPDATE quiz.user_profiles SET total_coins = $1, updated_at = NOW() WHERE user_id = $2`,
		newCoins, req.UserID,
	)
	if err != nil {
		log.Printf("error deducting coins: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Record purchase
	_, err = tx.ExecContext(ctx, `
		INSERT INTO user_svc.shop_purchases (id, user_id, item_id, item_name, item_type, coins_paid, purchased_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, uuid.New().String(), req.UserID, item.ID, item.Name, item.Type, item.Price, time.Now())
	if err != nil {
		log.Printf("error recording purchase: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err = tx.Commit(); err != nil {
		log.Printf("error committing tx: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"item_name":   item.Name,
		"coins_paid":  item.Price,
		"total_coins": newCoins,
	})
}

// handleGetPurchaseHistory returns a user's purchase history.
func handleGetPurchaseHistory(w http.ResponseWriter, r *http.Request) {
	if !onlyPOST(w, r) {
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &req); err != nil || req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	rows, err := db.QueryContext(r.Context(), `
		SELECT id, item_id, item_name, item_type, coins_paid, purchased_at
		FROM user_svc.shop_purchases
		WHERE user_id = $1
		ORDER BY purchased_at DESC
		LIMIT 20
	`, req.UserID)
	if err != nil {
		log.Printf("error fetching purchase history: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	type Purchase struct {
		ID          string `json:"id"`
		ItemID      string `json:"item_id"`
		ItemName    string `json:"item_name"`
		ItemType    string `json:"item_type"`
		CoinsPaid   int    `json:"coins_paid"`
		PurchasedAt string `json:"purchased_at"`
	}

	var purchases []Purchase
	for rows.Next() {
		var p Purchase
		var purchasedAt time.Time
		if err := rows.Scan(&p.ID, &p.ItemID, &p.ItemName, &p.ItemType, &p.CoinsPaid, &purchasedAt); err == nil {
			p.PurchasedAt = purchasedAt.Format(time.RFC3339)
			purchases = append(purchases, p)
		}
	}

	if purchases == nil {
		purchases = []Purchase{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"purchases": purchases,
	})
}
