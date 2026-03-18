package handler

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"community/pb"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UploadMedia - S3에 미디어 업로드 (이미지/영상)
func (h *Handler) UploadMedia(ctx context.Context, req *pb.UploadMediaRequest) (*pb.UploadMediaResponse, error) {
	if req.FileName == "" || len(req.Content) == 0 {
		return nil, status.Error(codes.InvalidArgument, "file_name and content required")
	}

	// 파일 확장자 및 타입 체크
	ext := strings.ToLower(filepath.Ext(req.FileName))
	allowedExts := map[string]string{
		".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
		".mp4": "video", ".mov": "video", ".avi": "video", ".webm": "video",
	}
	mediaType, ok := allowedExts[ext]
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "unsupported file type")
	}

	// 파일 크기 체크 (100MB)
	if len(req.Content) > 100<<20 {
		return nil, status.Error(codes.InvalidArgument, "file too large (max 100MB)")
	}

	// S3 설정
	bucket := os.Getenv("S3_COMMUNITY_BUCKET")
	if bucket == "" {
		bucket = "pawfiler-community-media"
	}
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-northeast-2"
	}
	cloudfrontDomain := os.Getenv("CLOUDFRONT_COMMUNITY_DOMAIN")
	if cloudfrontDomain == "" {
		cloudfrontDomain = "https://diqtpoikktqu2.cloudfront.net"
	}

	// S3 키 생성
	key := fmt.Sprintf("community/%s/%s%s", mediaType, uuid.New().String(), ext)

	// AWS 설정 로드
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		log.Printf("AWS config error: %v", err)
		return nil, status.Error(codes.Internal, "storage configuration error")
	}

	// S3 업로드
	client := s3.NewFromConfig(cfg)
	contentType := req.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(req.Content),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		log.Printf("S3 upload error: %v", err)
		return nil, status.Error(codes.Internal, "upload failed")
	}

	// URL 생성
	var mediaUrl string
	if cloudfrontDomain != "" {
		mediaUrl = fmt.Sprintf("%s/%s", strings.TrimRight(cloudfrontDomain, "/"), key)
	} else {
		mediaUrl = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, key)
	}

	log.Printf("✅ Uploaded media to S3: %s", key)
	return &pb.UploadMediaResponse{
		MediaUrl:  mediaUrl,
		MediaType: mediaType,
	}, nil
}
