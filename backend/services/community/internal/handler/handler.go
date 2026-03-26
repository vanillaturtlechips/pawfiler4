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

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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
	// S3 클라이언트 초기화 (시작 시 1회)
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(h.s3Region))
	if err != nil {
		log.Printf("[handler] AWS config load failed: %v — S3 operations will fail", err)
	} else {
		h.s3 = s3.NewFromConfig(cfg)
	}
	go h.startOrphanCleanup()
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

	// 최근 2일치 S3 파일 목록 조회
	out, err := h.s3.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(h.s3Bucket),
	})
	if err != nil {
		log.Printf("[ERROR] orphan cleanup: S3 list failed: %v", err)
		return
	}

	// 최근 2일치 DB media_url 조회
	rows, err := h.db.QueryContext(ctx, `
		SELECT media_url FROM community.posts
		WHERE created_at > NOW() - INTERVAL '2 days' AND media_url IS NOT NULL
	`)
	if err != nil {
		log.Printf("[ERROR] orphan cleanup: DB query failed: %v", err)
		return
	}
	defer rows.Close()

	inDB := map[string]struct{}{}
	for rows.Next() {
		var url string
		if err := rows.Scan(&url); err == nil {
			inDB[url] = struct{}{}
		}
	}

	cutoff := time.Now().Add(-2 * 24 * time.Hour)
	deleted := 0
	for _, obj := range out.Contents {
		if obj.LastModified.Before(cutoff) {
			continue // 2일 이전 파일은 건드리지 않음
		}
		var fileURL string
		if h.cfDomain != "" {
			fileURL = strings.TrimRight(h.cfDomain, "/") + "/" + aws.ToString(obj.Key)
		} else {
			fileURL = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", h.s3Bucket, h.s3Region, aws.ToString(obj.Key))
		}
		if _, ok := inDB[fileURL]; !ok {
			if err := h.deleteMediaFromS3(fileURL); err != nil {
				log.Printf("[ERROR] orphan cleanup: delete failed %s: %v", aws.ToString(obj.Key), err)
			} else {
				deleted++
			}
		}
	}
	log.Printf("[INFO] orphan cleanup done: deleted %d files", deleted)
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
