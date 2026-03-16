package handler

import (
	"context"

	"community/pb"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UploadMedia - S3에 미디어 업로드 (이미지/영상)
func (h *Handler) UploadMedia(ctx context.Context, req *pb.UploadMediaRequest) (*pb.UploadMediaResponse, error) {
	return nil, status.Error(codes.Unimplemented, "use /community/upload-media HTTP endpoint")
}
