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
	go h.startOrphanCleanup()
	if h.rdb != nil {
		go h.startLikeSyncBatch()
	}
	return h
}

// startOrphanCleanup - 매일 새벽 3시에 고아 S3 파일 정리
func (h *Handler) startOrphanCleanup() {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 3, 0, 0, 0, now.Location())
		time.Sleep(time.Until(next))
		h.cleanOrphanS3Files()
	}
}

func (h *Handler) cleanOrphanS3Files() {
	if h.s3 == nil {
		return
	}
	ctx := context.Background()

	// S3 전체 스캔 없이 DB에서 고아 파일만 조회 — 2일 지나도 게시글에 연결 안 된 것
	rows, err := h.db.QueryContext(ctx, `
		SELECT media_url FROM community.media_uploads
		WHERE uploaded_at < NOW() - INTERVAL '2 days'
	`)
	if err != nil {
		log.Printf("[ERROR] orphan cleanup: DB query failed: %v", err)
		return
	}
	defer rows.Close()

	deleted := 0
	for rows.Next() {
		var mediaURL string
		if err := rows.Scan(&mediaURL); err != nil {
			continue
		}
		if err := h.deleteMediaFromS3(mediaURL); err != nil {
			log.Printf("[ERROR] orphan cleanup: delete failed %s: %v", mediaURL, err)
			continue
		}
		h.db.ExecContext(ctx, "DELETE FROM community.media_uploads WHERE media_url = $1", mediaURL)
		deleted++
	}
	log.Printf("[INFO] orphan cleanup done: deleted %d files", deleted)
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

	// KEYS 대신 SCAN — KEYS는 전체 키스페이스를 블로킹 스캔하므로 프로덕션에서 위험
	var cursor uint64
	for {
		keys, nextCursor, err := h.rdb.Scan(ctx, cursor, "likes:*", 100).Result()
		if err != nil {
			log.Printf("[ERROR] likes sync scan failed: %v", err)
			return
		}
		for _, key := range keys {
			val, err := h.rdb.Get(ctx, key).Int64()
			if err != nil {
				continue
			}
			postID := strings.TrimPrefix(key, "likes:")
			if _, err = h.db.ExecContext(ctx, "UPDATE community.posts SET likes = $1 WHERE id = $2", val, postID); err != nil {
				log.Printf("[ERROR] likes sync failed for %s: %v", postID, err)
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
}
