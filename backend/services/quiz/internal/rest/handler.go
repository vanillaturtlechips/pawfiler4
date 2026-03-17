package rest

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	UpdateUserProfile(ctx context.Context, profile *repository.UserProfile) error
}

// NewMux returns an HTTP mux with quiz REST endpoints.
func NewMux(svc QuizService) http.Handler {
	return NewMuxWithDB(svc, nil)
}

func NewMuxWithDB(svc QuizService, db *sql.DB) http.Handler {
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
		mux.HandleFunc(prefix+"/quiz.QuizService/GetQuestionStats", withCORS(handleGetQuestionStats(db)))
		mux.HandleFunc(prefix+"/quiz.QuizService/GetRanking", withCORS(handleGetRanking(db)))
		mux.HandleFunc(prefix+"/quiz.QuizService/UpdateUserProfile", withCORS(handleUpdateUserProfile(svc)))
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		resp, err := svc.GetRandomQuestion(r.Context(), &req)
		if err != nil {
			// unwrap해서 gRPC ResourceExhausted 찾기
			target := err
			for target != nil {
				if st, ok := status.FromError(target); ok && st.Code() == codes.ResourceExhausted {
					msg := st.Message()
					energy := "0"
					if parts := strings.SplitN(msg, ":", 2); len(parts) == 2 {
						energy = parts[1]
					}
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusTooManyRequests)
					w.Write([]byte(`{"error":"insufficient_energy","energy":` + energy + `}`))
					return
				}
				target = errors.Unwrap(target)
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		// 승급 감지를 위해 제출 전 티어 저장
		prevTierName := ""
		if req.UserId != "" {
			if prevProfile, err := svc.GetUserProfile(r.Context(), req.UserId); err == nil {
				prevTierName = prevProfile.TierName()
			}
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
				result["tier_promoted"] = prevTierName != "" && prevTierName != profile.TierName()
			}
		}
		// streak_bonus는 handler에서 직접 계산 (streakCount % 5 == 0)
		if sc, ok := result["streakCount"].(float64); ok && sc > 0 && int(sc)%5 == 0 {
			result["streak_bonus"] = 20
		} else {
			result["streak_bonus"] = 0
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		
		profile, err := svc.GetUserProfile(r.Context(), req.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get profile")
			return
		}
		
		profile.Energy = profile.MaxEnergy
		if err := svc.UpdateUserProfile(r.Context(), profile); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"energy": profile.MaxEnergy,
		})
	}
}

func handleUpdateUserProfile(svc QuizService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			UserID      string `json:"user_id"`
			Nickname    string `json:"nickname"`
			AvatarEmoji string `json:"avatar_emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		profile, err := svc.GetUserProfile(r.Context(), req.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get profile")
			return
		}
		if req.Nickname != "" {
			profile.Nickname = req.Nickname
		}
		if req.AvatarEmoji != "" {
			profile.AvatarEmoji = req.AvatarEmoji
		}
		if err := svc.UpdateUserProfile(r.Context(), profile); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	}
}

func handleGetQuestionStats(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if db == nil {
			json.NewEncoder(w).Encode([]map[string]interface{}{})
			return
		}
		var req struct {
			QuestionID string `json:"question_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		var query string
		var args []interface{}
		if req.QuestionID != "" {
			query = `
				SELECT q.id, q.difficulty,
					COUNT(ua.id) as total,
					SUM(CASE WHEN ua.is_correct THEN 1 ELSE 0 END) as correct
				FROM quiz.questions q
				LEFT JOIN quiz.user_answers ua ON ua.question_id = q.id
				WHERE q.id = $1
				GROUP BY q.id, q.difficulty`
			args = []interface{}{req.QuestionID}
		} else {
			query = `
				SELECT q.id, q.difficulty,
					COUNT(ua.id) as total,
					SUM(CASE WHEN ua.is_correct THEN 1 ELSE 0 END) as correct
				FROM quiz.questions q
				LEFT JOIN quiz.user_answers ua ON ua.question_id = q.id
				GROUP BY q.id, q.difficulty
				ORDER BY total DESC
				LIMIT 50`
		}

		rows, err := db.QueryContext(r.Context(), query, args...)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type stat struct {
			ID         string  `json:"id"`
			Difficulty string  `json:"difficulty"`
			Total      int     `json:"total"`
			Correct    int     `json:"correct"`
			Accuracy   float64 `json:"accuracy"`
		}
		var stats []stat
		for rows.Next() {
			var s stat
			if err := rows.Scan(&s.ID, &s.Difficulty, &s.Total, &s.Correct); err != nil {
				continue
			}
			if s.Total > 0 {
				s.Accuracy = float64(s.Correct) / float64(s.Total) * 100
			}
			stats = append(stats, s)
		}
		if stats == nil {
			stats = []stat{}
		}
		json.NewEncoder(w).Encode(stats)
	}
}

func handleGetRanking(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if db == nil {
			json.NewEncoder(w).Encode([]map[string]interface{}{})
			return
		}
		var req struct {
			SortBy string `json:"sort_by"` // "correct", "accuracy", "tier", "coins"
		}
		req.SortBy = "correct"
		json.NewDecoder(r.Body).Decode(&req)

		orderBy := "us.correct_count DESC"
		switch req.SortBy {
		case "accuracy":
			orderBy = "CASE WHEN COALESCE(us.total_answered,0)>0 THEN us.correct_count::float/us.total_answered ELSE 0 END DESC"
		case "tier":
			orderBy = "CASE up.current_tier WHEN '불사조' THEN 4 WHEN '맹금닭' THEN 3 WHEN '삐약이' THEN 2 ELSE 1 END DESC, up.total_exp DESC"
		case "coins":
			orderBy = "up.total_coins DESC"
		}

		rows, err := db.QueryContext(r.Context(), `
			SELECT 
				up.user_id,
				COALESCE(NULLIF(au.nickname,''), NULLIF(up.nickname,''), '') as nickname,
				COALESCE(NULLIF(au.avatar_emoji,''), NULLIF(up.avatar_emoji,''), '🥚') as avatar_emoji,
				COALESCE(NULLIF(up.current_tier,''), '알') as tier,
				up.total_exp,
				up.total_coins,
				COALESCE(us.total_answered, 0) as total_answered,
				COALESCE(us.correct_count, 0) as correct_count,
				CASE WHEN COALESCE(us.total_answered,0) > 0 
					THEN ROUND(us.correct_count::numeric / us.total_answered * 100, 1)
					ELSE 0 END as accuracy
			FROM quiz.user_profiles up
			LEFT JOIN quiz.user_stats us ON us.user_id = up.user_id
			LEFT JOIN auth.users au ON au.id = up.user_id
			WHERE COALESCE(us.total_answered, 0) > 0
			ORDER BY `+orderBy)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type entry struct {
			Rank          int     `json:"rank"`
			UserID        string  `json:"userId"`
			Nickname      string  `json:"nickname"`
			AvatarEmoji   string  `json:"avatarEmoji"`
			Tier          string  `json:"tier"`
			Level         int     `json:"level"`
			TotalExp      int     `json:"totalExp"`
			TotalCoins    int     `json:"totalCoins"`
			TotalAnswered int     `json:"totalAnswered"`
			CorrectCount  int     `json:"correctCount"`
			Accuracy      float64 `json:"accuracy"`
		}
		var entries []entry
		rank := 1
		for rows.Next() {
			var e entry
			if err := rows.Scan(&e.UserID, &e.Nickname, &e.AvatarEmoji, &e.Tier, &e.TotalExp, &e.TotalCoins, &e.TotalAnswered, &e.CorrectCount, &e.Accuracy); err != nil {
				continue
			}
			e.Rank = rank
			// Level 계산
			p := &repository.UserProfile{TotalExp: int32(e.TotalExp), CurrentTier: e.Tier}
			e.Level = int(p.Level())
			entries = append(entries, e)
			rank++
		}
		if entries == nil {
			entries = []entry{}
		}
		json.NewEncoder(w).Encode(entries)
	}
}
