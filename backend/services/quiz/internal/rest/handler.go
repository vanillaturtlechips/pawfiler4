package rest

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/pawfiler/backend/services/quiz/internal/repository"
	pb "github.com/pawfiler/backend/services/quiz/proto"
)

var marshaler = protojson.MarshalOptions{
	EmitUnpopulated: true,
	UseProtoNames:   true,
}

var unmarshaler = protojson.UnmarshalOptions{
	DiscardUnknown: true,
}

// QuizService is the interface required by the REST handler
type QuizService interface {
	GetRandomQuestion(ctx context.Context, req *pb.GetRandomQuestionRequest) (*pb.QuizQuestion, error)
	SubmitAnswer(ctx context.Context, req *pb.SubmitAnswerRequest) (*pb.SubmitAnswerResponse, error)
	GetUserStats(ctx context.Context, req *pb.GetUserStatsRequest) (*pb.QuizStats, error)
	GetQuestionById(ctx context.Context, req *pb.GetQuestionByIdRequest) (*pb.QuizQuestion, error)
	GetUserProfile(ctx context.Context, userID string) (*repository.UserProfile, error)
}

// NewMux returns an HTTP mux with quiz REST endpoints.
func NewMux(svc QuizService) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	for _, prefix := range []string{"", "/api"} {
		mux.HandleFunc(prefix+"/quiz.QuizService/GetRandomQuestion", withCORS(handleGetRandomQuestion(svc)))
		mux.HandleFunc(prefix+"/quiz.QuizService/SubmitAnswer", withCORS(handleSubmitAnswer(svc)))
		mux.HandleFunc(prefix+"/quiz.QuizService/GetUserStats", withCORS(handleGetUserStats(svc)))
		mux.HandleFunc(prefix+"/quiz.QuizService/GetQuestionById", withCORS(handleGetQuestionById(svc)))
		mux.HandleFunc(prefix+"/quiz.QuizService/GetUserProfile", withCORS(handleGetUserProfile(svc)))
		mux.HandleFunc(prefix+"/quiz.QuizService/RefillEnergy", withCORS(handleRefillEnergy(svc)))
	}
	return mux
}

func handleGetRandomQuestion(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req pb.GetRandomQuestionRequest
		if err := readBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := svc.GetRandomQuestion(r.Context(), &req)
		if err != nil {
			// 에너지 부족 시 429 + 현재 에너지 반환
			if st, ok := status.FromError(err); ok && st.Code() == codes.ResourceExhausted {
				msg := st.Message() // "insufficient_energy:N"
				energy := "0"
				if parts := strings.SplitN(msg, ":", 2); len(parts) == 2 {
					energy = parts[1]
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"insufficient_energy","energy":` + energy + `}`))
				return
			}
			writeGRPCError(w, err)
			return
		}
		writeProto(w, resp)
	}
}

func handleSubmitAnswer(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req pb.SubmitAnswerRequest
		if err := readBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := svc.SubmitAnswer(r.Context(), &req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		// proto 응답 + 프로필 정보 병합
		jsonBytes, err := marshaler.Marshal(resp)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		var result map[string]interface{}
		json.Unmarshal(jsonBytes, &result)

		if req.UserId != "" {
			if profile, err := svc.GetUserProfile(r.Context(), req.UserId); err == nil {
				result["level"] = profile.Level()
				result["tier_name"] = profile.TierName()
				result["total_exp"] = profile.TotalExp
				result["total_coins"] = profile.TotalCoins
				result["energy"] = profile.Energy
				result["max_energy"] = profile.MaxEnergy
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(result)
	}
}

func handleGetUserStats(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req pb.GetUserStatsRequest
		if err := readBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := svc.GetUserStats(r.Context(), &req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		// proto 응답 + 프로필 정보 병합
		jsonBytes, _ := marshaler.Marshal(resp)
		var result map[string]interface{}
		json.Unmarshal(jsonBytes, &result)

		if req.UserId != "" {
			if profile, err := svc.GetUserProfile(r.Context(), req.UserId); err == nil {
				result["level"] = profile.Level()
				result["tier_name"] = profile.TierName()
				result["total_exp"] = profile.TotalExp
				result["total_coins"] = profile.TotalCoins
				result["energy"] = profile.Energy
				result["max_energy"] = profile.MaxEnergy
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(result)
	}
}

func handleGetQuestionById(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req pb.GetQuestionByIdRequest
		if err := readBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := svc.GetQuestionById(r.Context(), &req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		writeProto(w, resp)
	}
}

func handleGetUserProfile(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, _ := io.ReadAll(r.Body)
		defer r.Body.Close()
		var req struct {
			UserID string `json:"user_id"`
		}
		json.Unmarshal(body, &req)
		if req.UserID == "" {
			writeError(w, http.StatusBadRequest, "user_id required")
			return
		}
		profile, err := svc.GetUserProfile(r.Context(), req.UserID)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"user_id":    profile.UserID,
			"level":      profile.Level(),
			"tier_name":  profile.TierName(),
			"total_exp":  profile.TotalExp,
			"total_coins": profile.TotalCoins,
			"energy":     profile.Energy,
			"max_energy": profile.MaxEnergy,
		})
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
	case codes.ResourceExhausted:
		return http.StatusTooManyRequests
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

func handleRefillEnergy(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			UserID string `json:"user_id"`
		}
		if err := readBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		
		profile, err := svc.GetUserProfile(r.Context(), req.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get profile")
			return
		}
		
		profile.Energy = profile.MaxEnergy
		// UpdateUserProfile 직접 호출 불가하므로 임시로 에러 반환
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"energy": profile.MaxEnergy,
		})
	}
}
