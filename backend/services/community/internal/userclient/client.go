// Package userclient provides a gRPC client for the user service.
// Community service calls user service via gRPC to fetch up-to-date
// author profile (nickname, avatar) at post/comment creation time.
package userclient

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	userpb "community/internal/userpb"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type profileCacheEntry struct {
	nickname    string
	avatarEmoji string
	expiresAt   time.Time
}

// Client is a gRPC client for the user service.
type Client struct {
	mu           sync.Mutex
	conn         *grpc.ClientConn
	svc          userpb.UserServiceClient
	profileCache sync.Map // map[string]*profileCacheEntry
}

// New creates a lazy-connecting user service gRPC client.
func New() *Client {
	return &Client{}
}

func (c *Client) ensureConnected() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	// 기존 연결이 있으면 재사용
	if c.conn != nil {
		return nil
	}
	addr := os.Getenv("USER_SERVICE_GRPC_ADDR")
	if addr == "" {
		addr = "user-service:50054"
	}
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	c.conn = conn
	c.svc = userpb.NewUserServiceClient(conn)
	return nil
}

// GetProfile fetches nickname and avatar_emoji from user service via gRPC.
// 5분 인메모리 캐시로 동일 유저 반복 호출 방지.
func (c *Client) GetProfile(ctx context.Context, userID string) (nickname, avatarEmoji string) {
	// 캐시 확인
	if v, ok := c.profileCache.Load(userID); ok {
		entry := v.(*profileCacheEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.nickname, entry.avatarEmoji
		}
		c.profileCache.Delete(userID)
	}

	if err := c.ensureConnected(); err != nil {
		log.Printf("[userclient] connect failed: %v", err)
		return "탐정", "🦊"
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := c.svc.GetProfile(ctx, &userpb.GetProfileRequest{UserId: userID})
	if err != nil {
		log.Printf("[userclient] GetProfile failed for %s: %v — resetting connection", userID, err)
		c.mu.Lock()
		c.conn.Close()
		c.conn = nil
		c.svc = nil
		c.mu.Unlock()
		return "탐정", "🦊"
	}
	if resp.Nickname == "" {
		resp.Nickname = "탐정"
	}
	if resp.AvatarEmoji == "" {
		resp.AvatarEmoji = "🦊"
	}

	// 캐시 저장 (5분 TTL)
	c.profileCache.Store(userID, &profileCacheEntry{
		nickname:    resp.Nickname,
		avatarEmoji: resp.AvatarEmoji,
		expiresAt:   time.Now().Add(5 * time.Minute),
	})

	return resp.Nickname, resp.AvatarEmoji
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
