package rest

import (
	"context"
	"io"
	"log"
	"net/http"

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
	GetNotices(ctx context.Context, req *pb.GetNoticesRequest) (*pb.NoticesResponse, error)
	GetTopDetective(ctx context.Context, req *pb.GetTopDetectiveRequest) (*pb.TopDetectiveResponse, error)
	GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error)
}

func NewMux(svc CommunityService) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	for _, prefix := range []string{"", "/api"} {
		mux.HandleFunc(prefix+"/community.CommunityService/GetFeed", withCORS(handle(svc.GetFeed, &pb.GetFeedRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetPost", withCORS(handle(svc.GetPost, &pb.GetPostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CreatePost", withCORS(handle(svc.CreatePost, &pb.CreatePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/UpdatePost", withCORS(handle(svc.UpdatePost, &pb.UpdatePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/DeletePost", withCORS(handle(svc.DeletePost, &pb.DeletePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetComments", withCORS(handle(svc.GetComments, &pb.GetCommentsRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CreateComment", withCORS(handle(svc.CreateComment, &pb.CreateCommentRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/DeleteComment", withCORS(handle(svc.DeleteComment, &pb.DeleteCommentRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/LikePost", withCORS(handle(svc.LikePost, &pb.LikePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/UnlikePost", withCORS(handle(svc.UnlikePost, &pb.UnlikePostRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/CheckLike", withCORS(handle(svc.CheckLike, &pb.CheckLikeRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetNotices", withCORS(handle(svc.GetNotices, &pb.GetNoticesRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetTopDetective", withCORS(handle(svc.GetTopDetective, &pb.GetTopDetectiveRequest{})))
		mux.HandleFunc(prefix+"/community.CommunityService/GetHotTopic", withCORS(handle(svc.GetHotTopic, &pb.GetHotTopicRequest{})))
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
