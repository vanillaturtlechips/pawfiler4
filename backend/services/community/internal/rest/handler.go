package rest

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	pb "community/pb"
)

var marshaler = protojson.MarshalOptions{
	EmitUnpopulated: true,
	UseProtoNames:   true,
}

var unmarshaler = protojson.UnmarshalOptions{
	DiscardUnknown: true,
}

type CommunityService interface {
	GetFeed(ctx context.Context, req *pb.GetFeedRequest) (*pb.FeedResponse, error)
	GetPost(ctx context.Context, req *pb.GetPostRequest) (*pb.Post, error)
	CreatePost(ctx context.Context, req *pb.CreatePostRequest) (*pb.Post, error)
	UpdatePost(ctx context.Context, req *pb.UpdatePostRequest) (*pb.Post, error)
	DeletePost(ctx context.Context, req *pb.DeletePostRequest) (*pb.DeletePostResponse, error)
	GetComments(ctx context.Context, req *pb.GetCommentsRequest) (*pb.CommentsResponse, error)
	CreateComment(ctx context.Context, req *pb.CreateCommentRequest) (*pb.Comment, error)
	DeleteComment(ctx context.Context, req *pb.DeleteCommentRequest) (*pb.DeleteCommentResponse, error)
	LikePost(ctx context.Context, req *pb.LikePostRequest) (*pb.LikePostResponse, error)
	UnlikePost(ctx context.Context, req *pb.UnlikePostRequest) (*pb.UnlikePostResponse, error)
	CheckLike(ctx context.Context, req *pb.CheckLikeRequest) (*pb.CheckLikeResponse, error)
	VotePost(ctx context.Context, req *pb.VotePostRequest) (*pb.VotePostResponse, error)
	GetVoteResult(ctx context.Context, req *pb.GetVoteResultRequest) (*pb.VoteResult, error)
	GetUserVote(ctx context.Context, req *pb.GetUserVoteRequest) (*pb.GetUserVoteResponse, error)
	GetNotices(ctx context.Context, req *pb.GetNoticesRequest) (*pb.NoticesResponse, error)
	GetTopDetective(ctx context.Context, req *pb.GetTopDetectiveRequest) (*pb.TopDetectiveResponse, error)
	GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error)
}

func NewMux(svc CommunityService) http.Handler {
	return NewMuxWithDB(svc, nil)
}

func NewMuxWithDB(svc CommunityService, db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	for _, prefix := range []string{"", "/api"} {
		mux.HandleFunc(prefix+"/community.CommunityService/GetFeed", withCORS(handle(svc.GetFeed, &pb.GetFeedRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetPost", withCORS(handle(svc.GetPost, &pb.GetPostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CreatePost", withCORS(handleCreatePostWithMedia(svc)))
		mux.HandleFunc(prefix+"/community.CommunityService/UpdatePost", withCORS(handle(svc.UpdatePost, &pb.UpdatePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/DeletePost", withCORS(handle(svc.DeletePost, &pb.DeletePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetComments", withCORS(handle(svc.GetComments, &pb.GetCommentsRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CreateComment", withCORS(handle(svc.CreateComment, &pb.CreateCommentRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/DeleteComment", withCORS(handle(svc.DeleteComment, &pb.DeleteCommentRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/LikePost", withCORS(handle(svc.LikePost, &pb.LikePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/UnlikePost", withCORS(handle(svc.UnlikePost, &pb.UnlikePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CheckLike", withCORS(handle(svc.CheckLike, &pb.CheckLikeRequest{})))
		// 투표 관련 핸들러 (protobuf 무한 재귀 문제 해결됨)
		mux.HandleFunc(prefix+"/community.CommunityService/VotePost", withCORS(handle(svc.VotePost, &pb.VotePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetVoteResult", withCORS(handle(svc.GetVoteResult, &pb.GetVoteResultRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetUserVote", withCORS(handle(svc.GetUserVote, &pb.GetUserVoteRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetNotices", withCORS(handle(svc.GetNotices, &pb.GetNoticesRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetTopDetective", withCORS(handle(svc.GetTopDetective, &pb.GetTopDetectiveRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetHotTopic", withCORS(handle(svc.GetHotTopic, &pb.GetHotTopicRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetRanking", withCORS(handleGetRanking(db)))
		mux.HandleFunc(prefix+"/community.CommunityService/SyncAuthorNickname", handleSyncAuthorNickname(db))
	}
	return mux
}

// handle is a generic handler factory to reduce boilerplate
func handle[Req proto.Message, Resp proto.Message](
	fn func(context.Context, Req) (Resp, error),
	newReq Req,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		req := newReq.ProtoReflect().New().Interface().(Req)
		if err := readBody(r, req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := fn(r.Context(), req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		writeProto(w, resp)
	}
}

func readBody(r *http.Request, msg proto.Message) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if len(body) == 0 {
		return nil
	}
	return unmarshaler.Unmarshal(body, msg)
}

func writeProto(w http.ResponseWriter, msg proto.Message) {
	jsonBytes, err := marshaler.Marshal(msg)
	if err != nil {
		log.Printf("failed to marshal response: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(jsonBytes)
}

func writeGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeError(w, grpcCodeToHTTP(st.Code()), st.Message())
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write([]byte(`{"error":"` + msg + `"}`))
}

func grpcCodeToHTTP(code codes.Code) int {
	switch code {
	case codes.NotFound:
		return http.StatusNotFound
	case codes.InvalidArgument:
		return http.StatusBadRequest
	case codes.PermissionDenied:
		return http.StatusForbidden
	case codes.Unauthenticated:
		return http.StatusUnauthorized
	case codes.AlreadyExists:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

type RankingEntry struct {
	Rank           int    `json:"rank"`
	UserID         string `json:"userId"`
	Nickname       string `json:"nickname"`
	Emoji          string `json:"emoji"`
	TierName       string `json:"tierName"`
	TotalAnswered  int    `json:"totalAnswered"`
	CorrectAnswers int    `json:"correctAnswers"`
	TotalCoins     int    `json:"totalCoins"`
}

func handleSyncAuthorNickname(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			UserID      string `json:"user_id"`
			Nickname    string `json:"nickname"`
			AvatarEmoji string `json:"avatar_emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.UserID == "" || req.Nickname == "" {
			writeError(w, http.StatusBadRequest, "user_id and nickname are required")
			return
		}
		_, err := db.ExecContext(r.Context(), `
			UPDATE community.posts SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
		`, req.Nickname, req.AvatarEmoji, req.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update posts")
			return
		}
		_, err = db.ExecContext(r.Context(), `
			UPDATE community.comments SET author_nickname = $1, author_emoji = $2 WHERE author_id = $3
		`, req.Nickname, req.AvatarEmoji, req.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update comments")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	}
}

func handleGetRanking(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if db == nil {
			json.NewEncoder(w).Encode([]RankingEntry{})
			return
		}
		rows, err := db.QueryContext(r.Context(), `
			SELECT 
				p.author_id,
				p.author_nickname,
				p.author_emoji,
				COALESCE(qp.current_tier, '알') as current_tier,
				COALESCE(qs.total_answered, 0) as total_answered,
				COALESCE(qs.correct_answers, 0) as correct_answers,
				COALESCE(qp.total_coins, 0) as total_coins
			FROM (
				SELECT DISTINCT author_id, author_nickname, author_emoji
				FROM community.posts
			) p
			LEFT JOIN quiz.user_profiles qp ON qp.user_id::text = p.author_id
			LEFT JOIN quiz.user_stats qs ON qs.user_id::text = p.author_id
			ORDER BY COALESCE(qs.correct_answers, 0) DESC
			LIMIT 20
		`)
		if err != nil {
			http.Error(w, "failed to query ranking", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var entries []RankingEntry
		rank := 1
		for rows.Next() {
			var e RankingEntry
			var tier string
			if err := rows.Scan(&e.UserID, &e.Nickname, &e.Emoji, &tier, &e.TotalAnswered, &e.CorrectAnswers, &e.TotalCoins); err != nil {
				continue
			}
			e.Rank = rank
			e.TierName = tier
			entries = append(entries, e)
			rank++
		}
		if entries == nil {
			entries = []RankingEntry{}
		}
		json.NewEncoder(w).Encode(entries)
	}
}

func handleCreatePostWithMedia(svc CommunityService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Content-Type 확인
		contentType := r.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "multipart/form-data") {
			// multipart/form-data 처리
			handleCreatePostMultipart(svc, w, r)
		} else {
			// 기존 JSON 처리
			handleCreatePostJSON(svc, w, r)
		}
	}
}

func handleCreatePostJSON(svc CommunityService, w http.ResponseWriter, r *http.Request) {
	req := &pb.CreatePostRequest{}
	if err := readBody(r, req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	resp, err := svc.CreatePost(r.Context(), req)
	if err != nil {
		writeGRPCError(w, err)
		return
	}
	writeProto(w, resp)
}

func handleCreatePostMultipart(svc CommunityService, w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large (max 100MB)")
		return
	}

	// 폼 데이터 파싱
	req := &pb.CreatePostRequest{
		UserId:         r.FormValue("user_id"),
		AuthorNickname: r.FormValue("author_nickname"),
		AuthorEmoji:    r.FormValue("author_emoji"),
		Title:          r.FormValue("title"),
		Body:           r.FormValue("body"),
		IsAdminPost:    r.FormValue("is_admin_post") == "true",
	}

	// tags 파싱
	if tagsStr := r.FormValue("tags"); tagsStr != "" {
		var tags []string
		if err := json.Unmarshal([]byte(tagsStr), &tags); err == nil {
			req.Tags = tags
		}
	}

	// is_correct 파싱
	if isCorrectStr := r.FormValue("is_correct"); isCorrectStr != "" {
		if isCorrectStr == "true" {
			isCorrect := true
			req.IsCorrect = &isCorrect
		} else if isCorrectStr == "false" {
			isCorrect := false
			req.IsCorrect = &isCorrect
		}
	}

	// 파일이 있으면 S3 업로드
	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()

		// 파일 타입 검증
		contentType := header.Header.Get("Content-Type")
		ext := strings.ToLower(filepath.Ext(header.Filename))
		allowedExts := map[string]string{
			".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
			".mp4": "video", ".mov": "video", ".avi": "video", ".webm": "video",
		}
		mediaType, ok := allowedExts[ext]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported file type")
			return
		}

		// S3 업로드
		bucket := os.Getenv("S3_COMMUNITY_BUCKET")
		if bucket == "" {
			bucket = "pawfiler-community-media"
		}
		region := os.Getenv("AWS_REGION")
		if region == "" {
			region = "ap-northeast-2"
		}
		cloudfrontDomain := os.Getenv("CLOUDFRONT_COMMUNITY_DOMAIN")

		key := fmt.Sprintf("community/%s/%s%s", mediaType, uuid.New().String(), ext)

		cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(region))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "storage configuration error")
			return
		}

		client := s3.NewFromConfig(cfg)
		_, err = client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket:      aws.String(bucket),
			Key:         aws.String(key),
			Body:        file,
			ContentType: aws.String(contentType),
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "media upload failed")
			return
		}

		var mediaUrl string
		if cloudfrontDomain != "" {
			mediaUrl = fmt.Sprintf("%s/%s", strings.TrimRight(cloudfrontDomain, "/"), key)
		} else {
			mediaUrl = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, key)
		}

		req.MediaUrl = mediaUrl
		req.MediaType = mediaType
	}

	// 글 생성
	resp, err := svc.CreatePost(r.Context(), req)
	if err != nil {
		// 글 생성 실패 시 업로드된 파일 삭제
		if req.MediaUrl != "" {
			deleteMediaFromS3(req.MediaUrl)
		}
		writeGRPCError(w, err)
		return
	}

	writeProto(w, resp)
}

func deleteMediaFromS3(mediaURL string) error {
	// CloudFront URL에서 S3 key 추출
	// https://diqtpoikktqu2.cloudfront.net/community/image/xxx.png -> community/image/xxx.png
	parts := strings.Split(mediaURL, "/")
	if len(parts) < 4 {
		return fmt.Errorf("invalid media URL format: %s", mediaURL)
	}
	key := strings.Join(parts[len(parts)-3:], "/")

	bucket := os.Getenv("S3_COMMUNITY_BUCKET")
	if bucket == "" {
		bucket = "pawfiler-community-media"
	}
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-northeast-2"
	}

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(region))
	if err != nil {
		return fmt.Errorf("AWS config error: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	_, err = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("S3 delete error: %w", err)
	}
	log.Printf("✅ Deleted media from S3: %s", key)
	return nil
}


