package handler

import (
	"database/sql"
	"sync"
	"time"

	"community/internal/userclient"
	"community/pb"
)

// rankingCacheEntry 랭킹 응답을 TTL과 함께 저장하는 인메모리 캐시
type rankingCacheEntry struct {
	data      *pb.GetRankingResponse
	expiresAt time.Time
}

// Handler - gRPC 핸들러 구조체
type Handler struct {
	pb.UnimplementedCommunityServiceServer
	db             *sql.DB
	userClient     *userclient.Client
	rankingCache   *rankingCacheEntry
	rankingCacheMu sync.RWMutex
}

// NewHandler - 핸들러 생성
func NewHandler(db *sql.DB) *Handler {
	return &Handler{
		db:         db,
		userClient: userclient.New(),
	}
}
