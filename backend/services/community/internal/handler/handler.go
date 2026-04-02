package handler

import (
	"context"
	"database/sql"
	"fmt"
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
	feedCache      map[int32]*feedCacheEntry
	feedCacheMu    sync.RWMutex
	feedCount      int32
	feedCountExp   time.Time
	feedCountMu    sync.RWMutex
}

type feedCacheEntry struct {
	data      *pb.FeedResponse
	expiresAt time.Time
}

// NewHandler - 핸들러 생성
func NewHandler(db *sql.DB) *Handler {
	h := &Handler{
		db:         db,
		userClient: userclient.New(),
		s3Bucket:   getEnvOrDefault("S3_COMMUNITY_BUCKET", "pawfiler-community-media"),
		s3Region:   getEnvOrDefault("AWS_REGION", "ap-northeast-2"),
		cfDomain:   getEnvOrDefault("CLOUDFRONT_COMMUNITY_DOMAIN", ""),
		feedCache:  make(map[int32]*feedCacheEntry),
	}
	// Redis 클라이언트 초기화
	redisAddr := getEnvOrDefault("REDIS_ADDR", "redis:6379")
	h.rdb = redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		PoolSize:     30,
		MinIdleConns: 5,
		ReadTimeout:  2 * time.Second,
		WriteTimeout: 2 * time.Second,
	})
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

	// SCAN으로 likes:* 키 전체 수집
	var cursor uint64
	var allKeys []string
	for {
		keys, nextCursor, err := h.rdb.Scan(ctx, cursor, "likes:*", 100).Result()
		if err != nil {
			log.Printf("[ERROR] likes sync scan failed: %v", err)
			return
		}
		allKeys = append(allKeys, keys...)
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	if len(allKeys) == 0 {
		return
	}

	// MGet으로 값 한 번에 조회
	vals, err := h.rdb.MGet(ctx, allKeys...).Result()
	if err != nil {
		log.Printf("[ERROR] likes sync mget failed: %v", err)
		return
	}

	likesMap := map[string]int64{}
	for i, v := range vals {
		if v == nil {
			continue
		}
		var n int64
		fmt.Sscanf(fmt.Sprintf("%v", v), "%d", &n)
		postID := strings.TrimPrefix(allKeys[i], "likes:")
		likesMap[postID] = n
	}

	if len(likesMap) == 0 {
		return
	}

	// VALUES 배치로 쿼리 1번에 전체 동기화 — UPDATE N번 → 1번
	args := make([]interface{}, 0, len(likesMap)*2)
	placeholders := make([]string, 0, len(likesMap))
	i := 1
	for postID, val := range likesMap {
		placeholders = append(placeholders, fmt.Sprintf("($%d::uuid, $%d::int)", i, i+1))
		args = append(args, postID, val)
		i += 2
	}
	query := fmt.Sprintf(`
		UPDATE community.posts SET likes = v.likes
		FROM (VALUES %s) AS v(id, likes)
		WHERE posts.id = v.id
	`, strings.Join(placeholders, ","))

	if _, err := h.db.ExecContext(ctx, query, args...); err != nil {
		log.Printf("[ERROR] likes batch sync failed: %v", err)
	}
}
