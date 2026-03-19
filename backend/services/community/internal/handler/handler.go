package handler

import (
	"context"
	"database/sql"
	"log"
	"os"
	"sync"
	"time"

	"community/internal/userclient"
	"community/pb"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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
	s3             *s3.Client
	s3Bucket       string
	s3Region       string
	cfDomain       string
	rankingCache   *rankingCacheEntry
	rankingCacheMu sync.RWMutex
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
	// S3 클라이언트 초기화 (시작 시 1회)
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(h.s3Region))
	if err != nil {
		log.Printf("[handler] AWS config load failed: %v — S3 operations will fail", err)
	} else {
		h.s3 = s3.NewFromConfig(cfg)
	}
	return h
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
