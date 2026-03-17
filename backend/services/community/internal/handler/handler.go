package handler

import (
	"database/sql"

	"community/internal/userclient"
	"community/pb"
)

// Handler - gRPC 핸들러 구조체
type Handler struct {
	pb.UnimplementedCommunityServiceServer
	db         *sql.DB
	userClient *userclient.Client
}

// NewHandler - 핸들러 생성
func NewHandler(db *sql.DB) *Handler {
	return &Handler{
		db:         db,
		userClient: userclient.New(),
	}
}
