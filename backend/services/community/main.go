package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

type Post struct {
	ID             string   `json:"id"`
	AuthorNickname string   `json:"authorNickname"`
	AuthorEmoji    string   `json:"authorEmoji"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Likes          int      `json:"likes"`
	Comments       int      `json:"comments"`
	CreatedAt      string   `json:"createdAt"`
	Tags           []string `json:"tags"`
	UserID         string   `json:"userId,omitempty"`
}

type FeedResponse struct {
	Posts      []Post `json:"posts"`
	TotalCount int    `json:"totalCount"`
	Page       int    `json:"page"`
}

type CreatePostRequest struct {
	UserID         string   `json:"userId"`
	AuthorNickname string   `json:"authorNickname"`
	AuthorEmoji    string   `json:"authorEmoji"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Tags           []string `json:"tags"`
}

type UpdatePostRequest struct {
	PostID string   `json:"postId"`
	Title  string   `json:"title"`
	Body   string   `json:"body"`
	Tags   []string `json:"tags"`
}

type DeletePostRequest struct {
	PostID string `json:"postId"`
}

var (
	postsMu sync.RWMutex
	posts   = []Post{
		{ID: "p1", AuthorNickname: "꼬마 탐정", AuthorEmoji: "🐱", Title: "딥페이크 찾는 꿀팁 공유!", Body: "눈 깜빡임을 잘 보세요...", Likes: 42, Comments: 7, CreatedAt: "2026-02-20T10:00:00Z", Tags: []string{"팁", "초보"}},
		{ID: "p2", AuthorNickname: "수리 부엉이", AuthorEmoji: "🦉", Title: "레벨 10 달성 후기", Body: "드디어 마스터 탐정이 되었어요!", Likes: 128, Comments: 23, CreatedAt: "2026-02-22T15:30:00Z", Tags: []string{"후기", "레벨업"}},
		{ID: "p3", AuthorNickname: "용감한 곰", AuthorEmoji: "🐻", Title: "이 영상 진짜인가요?", Body: "친구가 보내준 영상인데 좀 이상해요...", Likes: 15, Comments: 5, CreatedAt: "2026-02-24T09:00:00Z", Tags: []string{"질문"}},
		{ID: "p4", AuthorNickname: "현명한 사막여우", AuthorEmoji: "🦊", Title: "딥페이크 구분 체크리스트", Body: "빛 반사, 경계, 눈 깜빡임, 음성 싱크를 점검하세요.", Likes: 67, Comments: 11, CreatedAt: "2026-02-25T08:20:00Z", Tags: []string{"가이드", "체크리스트"}},
		{ID: "p5", AuthorNickname: "빠른 치타", AuthorEmoji: "🐆", Title: "라이브 방송 딥페이크 판별법", Body: "실시간 스트림에서 지연과 왜곡을 살펴보면 힌트가 있어요.", Likes: 33, Comments: 3, CreatedAt: "2026-02-25T10:40:00Z", Tags: []string{"실시간", "스트리밍"}},
		{ID: "p6", AuthorNickname: "차분한 펭귄", AuthorEmoji: "🐧", Title: "초보자를 위한 시작 가이드", Body: "먼저 기본 개념을 이해하고 쉬운 예시로 연습해요.", Likes: 54, Comments: 9, CreatedAt: "2026-02-25T12:00:00Z", Tags: []string{"초보", "가이드"}},
		{ID: "p7", AuthorNickname: "센스있는 너구리", AuthorEmoji: "🦝", Title: "합성 경계 보는 요령", Body: "머리카락이나 귀 주변의 경계를 확대해서 확인해보세요.", Likes: 21, Comments: 2, CreatedAt: "2026-02-25T13:30:00Z", Tags: []string{"팁", "합성"}},
		{ID: "p8", AuthorNickname: "집중하는 올빼미", AuthorEmoji: "🦉", Title: "모델 버전별 차이", Body: "최근 모델은 음성 합성의 자연스러움이 크게 올라왔어요.", Likes: 44, Comments: 6, CreatedAt: "2026-02-25T14:10:00Z", Tags: []string{"모델", "업데이트"}},
		{ID: "p9", AuthorNickname: "웃는 토끼", AuthorEmoji: "🐰", Title: "가벼운 잡담방", Body: "오늘도 다 같이 진짜와 가짜를 구분해봐요!", Likes: 12, Comments: 8, CreatedAt: "2026-02-25T15:00:00Z", Tags: []string{"잡담"}},
		{ID: "p10", AuthorNickname: "정밀한 두더지", AuthorEmoji: "🐹", Title: "프레임 분석 팁", Body: "프레임 단위로 나눠서 재생하면 어색함이 더 잘 보입니다.", Likes: 39, Comments: 4, CreatedAt: "2026-02-25T15:45:00Z", Tags: []string{"프레임", "분석"}},
		{ID: "p11", AuthorNickname: "호기심 많은 수달", AuthorEmoji: "🦦", Title: "음성 싱크 점검", Body: "입 모양과 발음 타이밍이 미묘하게 어긋나면 의심하세요.", Likes: 26, Comments: 3, CreatedAt: "2026-02-25T16:20:00Z", Tags: []string{"음성", "싱크"}},
		{ID: "p12", AuthorNickname: "꼼꼼한 다람쥐", AuthorEmoji: "🐿️", Title: "조명 일치 확인", Body: "얼굴과 배경의 조명 방향이 다르면 합성일 확률이 높아요.", Likes: 31, Comments: 7, CreatedAt: "2026-02-25T17:05:00Z", Tags: []string{"조명", "배경"}},
	}
	postCounter = 13
)

func getFeedHandler(w http.ResponseWriter, r *http.Request) {
	postsMu.RLock()
	defer postsMu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(FeedResponse{Posts: posts, TotalCount: len(posts), Page: 1})
}

func createPostHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("CreatePost request received: %s %s", r.Method, r.URL.Path)
	var req CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	log.Printf("Creating post for user %s: %s", req.UserID, req.Title)

	postsMu.Lock()
	newPost := Post{
		ID:             fmt.Sprintf("p%d", postCounter),
		AuthorNickname: req.AuthorNickname,
		AuthorEmoji:    req.AuthorEmoji,
		Title:          req.Title,
		Body:           req.Body,
		Tags:           req.Tags,
		CreatedAt:      time.Now().Format(time.RFC3339),
		Likes:          0,
		Comments:       0,
		UserID:         req.UserID,
	}
	posts = append([]Post{newPost}, posts...)
	postCounter++
	postsMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(newPost)
}

func updatePostHandler(w http.ResponseWriter, r *http.Request) {
	var req UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	postsMu.Lock()
	defer postsMu.Unlock()

	for i, p := range posts {
		if p.ID == req.PostID {
			posts[i].Title = req.Title
			posts[i].Body = req.Body
			posts[i].Tags = req.Tags
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(posts[i])
			return
		}
	}

	http.Error(w, "Post not found", http.StatusNotFound)
}

func deletePostHandler(w http.ResponseWriter, r *http.Request) {
	var req DeletePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	postsMu.Lock()
	defer postsMu.Unlock()

	for i, p := range posts {
		if p.ID == req.PostID {
			posts = append(posts[:i], posts[i+1:]...)
			w.WriteHeader(http.StatusOK)
			fmt.Fprintf(w, `{"success": true}`)
			return
		}
	}

	http.Error(w, "Post not found", http.StatusNotFound)
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func main() {
	http.HandleFunc("/community.CommunityService/GetFeed", corsMiddleware(getFeedHandler))
	http.HandleFunc("/community.CommunityService/CreatePost", corsMiddleware(createPostHandler))
	http.HandleFunc("/community.CommunityService/UpdatePost", corsMiddleware(updatePostHandler))
	http.HandleFunc("/community.CommunityService/DeletePost", corsMiddleware(deletePostHandler))

	log.Println("Community service listening on :50053")
	if err := http.ListenAndServe(":50053", nil); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
