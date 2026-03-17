// Package userclient provides a gRPC client for the user service.
// Quiz service delegates profile operations to user service via gRPC,
// keeping quiz DB transactions minimal (stats only).
package userclient

import (
	"context"
	"log"
	"os"
	"time"

	userpb "github.com/pawfiler/backend/services/quiz/userpb"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Client struct {
	conn *grpc.ClientConn
	svc  userpb.UserServiceClient
}

func New() *Client {
	c := &Client{}
	// 앱 시작 시 미리 연결 (첫 요청 지연 방지)
	_ = c.ensureConnected()
	return c
}

func (c *Client) ensureConnected() error {
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

// GetProfile fetches user profile from user service.
func (c *Client) GetProfile(ctx context.Context, userID string) (*userpb.UserProfile, error) {
	if err := c.ensureConnected(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return c.svc.GetProfile(ctx, &userpb.GetProfileRequest{UserId: userID})
}

// AddRewards delegates xp/coin reward to user service via gRPC.
// This keeps quiz DB transactions minimal (stats only).
func (c *Client) AddRewards(ctx context.Context, userID string, xpDelta, coinDelta int32) error {
	if xpDelta == 0 && coinDelta == 0 {
		return nil
	}
	if err := c.ensureConnected(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := c.svc.AddRewards(ctx, &userpb.AddRewardsRequest{
		UserId:    userID,
		XpDelta:   xpDelta,
		CoinDelta: coinDelta,
	})
	if err != nil {
		log.Printf("[userclient] AddRewards failed for %s: %v", userID, err)
	}
	return err
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
