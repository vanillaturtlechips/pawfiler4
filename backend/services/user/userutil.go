package main

import (
	"context"

	"google.golang.org/grpc/metadata"
)

// extractUserID returns the user_id injected by Istio/Envoy as the x-user-id
// gRPC metadata key. Falls back to the proto field value for internal service calls
// (e.g., video-analysis service) that don't go through Istio JWT validation.
func extractUserID(ctx context.Context, fallback string) string {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if vals := md.Get("x-user-id"); len(vals) > 0 && vals[0] != "" {
			return vals[0]
		}
	}
	return fallback
}
