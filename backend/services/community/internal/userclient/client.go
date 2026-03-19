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

// Client is a gRPC client for the user service.
type Client struct {
	mu   sync.Mutex
	conn *grpc.ClientConn
	svc  userpb.UserServiceClient
}

// New creates a lazy-connecting user service gRPC client.
func New() *Client {
	return &Client{}
}

func (c *Client) ensureConnected() error {
	c.mu.Lock()
	defer c.mu.Unlock()
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
// Falls back to defaults if user service is unavailable.
func (c *Client) GetProfile(ctx context.Context, userID string) (nickname, avatarEmoji string) {
	if err := c.ensureConnected(); err != nil {
		log.Printf("[userclient] connect failed: %v", err)
		return "탐정", "🦊"
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := c.svc.GetProfile(ctx, &userpb.GetProfileRequest{UserId: userID})
	if err != nil {
		log.Printf("[userclient] GetProfile failed for %s: %v", userID, err)
		return "탐정", "🦊"
	}
	if resp.Nickname == "" {
		resp.Nickname = "탐정"
	}
	if resp.AvatarEmoji == "" {
		resp.AvatarEmoji = "🦊"
	}
	return resp.Nickname, resp.AvatarEmoji
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
