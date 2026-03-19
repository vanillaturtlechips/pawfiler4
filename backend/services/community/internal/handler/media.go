package handler

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"community/pb"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UploadMedia - S3에 미디어 업로드 (이미지/영상)
func (h *Handler) UploadMedia(ctx context.Context, req *pb.UploadMediaRequest) (*pb.UploadMediaResponse, error) {
	log.Printf("🔄 UploadMedia called - FileName: %s, ContentSize: %d bytes", req.FileName, len(req.Content))

	if req.FileName == "" || len(req.Content) == 0 {
		return nil, status.Error(codes.InvalidArgument, "file_name and content required")
	}

	ext := strings.ToLower(filepath.Ext(req.FileName))
	allowedExts := map[string]string{
		".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
		".mp4": "video", ".mov": "video", ".avi": "video", ".webm": "video",
	}
	mediaType, ok := allowedExts[ext]
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "unsupported file type")
	}

	if len(req.Content) > 100<<20 {
		return nil, status.Error(codes.InvalidArgument, "file too large (max 100MB)")
	}

	if h.s3 == nil {
		return nil, status.Error(codes.Internal, "storage not configured")
	}

	key := fmt.Sprintf("community/%s/%s%s", mediaType, uuid.New().String(), ext)

	contentType := req.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err := h.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.s3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(req.Content),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		log.Printf("S3 upload error: %v", err)
		return nil, status.Error(codes.Internal, "upload failed")
	}

	var mediaUrl string
	if h.cfDomain != "" {
		mediaUrl = fmt.Sprintf("%s/%s", strings.TrimRight(h.cfDomain, "/"), key)
	} else {
		mediaUrl = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", h.s3Bucket, h.s3Region, key)
	}

	log.Printf("✅ Uploaded media to S3: %s", key)
	return &pb.UploadMediaResponse{
		MediaUrl:  mediaUrl,
		MediaType: mediaType,
	}, nil
}
