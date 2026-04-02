package handler

import (
	"context"
	"database/sql"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"community/internal/userclient"
	"community/pb"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/redis/go-redis/v9"
)

// rankingCacheEntry 랭킹 응답을 TTL과 함께 저장하는 인메모리 캐시
type rankingCacheEntry struct {
	data      *pb.GetRankingResponse
	expiresAt time.Time
}

type hotTopicCacheEntry struct {
	data      *pb.HotTopicResponse
	expiresAt time.Time
}

// Handler - gRPC 핸들러 구조체
type Handler struct {
	pb.UnimplementedCommunityServiceServer
	db              *sql.DB
	rdb             *redis.Client
	userClient      *userclient.Client
	s3              *s3.Client
	s3Bucket        string
	s3Region        string
	cfDomain        string
	rankingCache    *rankingCacheEntry
	rankingCacheMu  sync.RWMutex
	hotTopicCache   *hotTopicCacheEntry
	hotTopicCacheMu sync.RWMutex
}

// NewHandler - 핸들러 생성
func NewHandler(db *sql.DB) *Handler {
	h := &Handler{
		db:         db,
		userClient: userclient.New(),
		s3Bucket:   getEnvOrDefault("S3_COMMUNITY_BUCKET", "pawfiler-community-media"),
		s3Region:   getEnvOrDefault("AWS_REGION", "ap-northeast-2"),
		cfDomain:   getEnvOrDefault("CLOUDFRONT_COMMUNITY_DOMAIN", ""),
	}
	// Redis 클라이언트 초기화
	redisAddr := getEnvOrDefault("REDIS_ADDR", "redis:6379")
	h.rdb = redis.NewClient(&redis.Options{Addr: redisAddr, PoolSize: 10})
	if err := h.rdb.Ping(context.Background()).Err(); err != nil {
		log.Printf("[handler] Redis connection failed: %v — like counts will use DB directly", err)
		h.rdb = nil
	}

	// S3 클라이언트 초기화 (시작 시 1회)
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(h.s3Region))
	if err != nil {
		log.Printf("[handler] AWS config load failed: %v — S3 operations will fail", err)
	} else {
		h.s3 = s3.NewFromConfig(cfg)
	}
	if h.rdb != nil {
		go h.startLikeSyncBatch()
	}
	return h
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// startLikeSyncBatch - 30초마다 Redis likes → DB 동기화
func (h *Handler) startLikeSyncBatch() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		h.syncLikesToDB()
	}
}

func (h *Handler) syncLikesToDB() {
	ctx := context.Background()

	// likes 테이블 COUNT로 posts.likes 동기화 (source of truth)
	_, err := h.db.ExecContext(ctx, `
		UPDATE community.posts p
		SET likes = (
			SELECT COUNT(*) FROM community.likes l 
			WHERE l.post_id = p.id
		)
		WHERE EXISTS (
			SELECT 1 FROM community.likes l 
			WHERE l.post_id = p.id
		)
	`)
	if err != nil {
		log.Printf("[ERROR] likes sync from DB failed: %v", err)
		return
	}

	// Redis 캐시도 업데이트 (선택적)
	if h.rdb != nil {
		// Redis에 있는 키들만 갱신
		var cursor uint64
		for {
			keys, nextCursor, err := h.rdb.Scan(ctx, cursor, "likes:*", 100).Result()
			if err != nil {
				break
			}
			for _, key := range keys {
				postID := strings.TrimPrefix(key, "likes:")
				var dbLikes int64
				h.db.QueryRowContext(ctx, "SELECT likes FROM community.posts WHERE id = $1", postID).Scan(&dbLikes)
				h.rdb.Set(ctx, key, dbLikes, 24*time.Hour)
			}
			cursor = nextCursor
			if cursor == 0 {
				break
			}
		}
	}
}
