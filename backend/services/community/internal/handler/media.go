package handler

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// uploadMediaInternal - S3에 미디어 업로드 (내부 전용, CreatePost에서 호출)
func (h *Handler) uploadMediaInternal(ctx context.Context, fileName string, content []byte, contentType string) (mediaUrl string, mediaType string, err error) {
	log.Printf("uploadMediaInternal called - FileName: %s, ContentSize: %d bytes", fileName, len(content))

	ext := strings.ToLower(filepath.Ext(fileName))
	allowedExts := map[string]string{
		".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
		".mp4": "video", ".mov": "video", ".avi": "video", ".webm": "video",
	}
	mt, ok := allowedExts[ext]
	if !ok {
		return "", "", status.Error(codes.InvalidArgument, "unsupported file type")
	}

	if len(content) > 100<<20 {
		return "", "", status.Error(codes.InvalidArgument, "file too large (max 100MB)")
	}

	if h.s3 == nil {
		return "", "", status.Error(codes.Internal, "storage not configured")
	}

	key := fmt.Sprintf("community/%s/%s%s", mt, uuid.New().String(), ext)

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err = h.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.s3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(content),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		log.Printf("S3 upload error: %v", err)
		return "", "", status.Error(codes.Internal, "upload failed")
	}

	if h.cfDomain != "" {
		mediaUrl = fmt.Sprintf("%s/%s", strings.TrimRight(h.cfDomain, "/"), key)
	} else {
		mediaUrl = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", h.s3Bucket, h.s3Region, key)
	}

	log.Printf("Uploaded media to S3: %s", key)
	return mediaUrl, mt, nil
}
