# 커뮤니티 서비스 설계 문서

## Overview

커뮤니티 서비스는 딥페이크 탐지 교육 플랫폼의 사용자 간 정보 공유 및 소통을 위한 gRPC 기반 마이크로서비스입니다. 게시글 작성, 조회, 수정, 삭제, 댓글, 좋아요 기능을 제공하며, PostgreSQL 데이터베이스를 사용합니다.

### 핵심 기능

- **게시글 관리**: CRUD 작업 (생성, 조회, 수정, 삭제)
- **댓글 시스템**: 게시글에 댓글 작성 및 삭제
- **좋아요 기능**: 게시글 좋아요/취소
- **피드 조회**: 페이지네이션 및 검색 지원
- **필터링**: 태그별, 사용자별 게시글 조회
- **권한 관리**: 작성자만 수정/삭제 가능
- **대시보드 API**: 공지사항, 탐정 랭킹, 인기 토픽

### 기술 스택

- **언어**: Go 1.21+
- **프로토콜**: gRPC (Protocol Buffers)
- **데이터베이스**: PostgreSQL 15+
- **컨테이너화**: Docker, Docker Compose

## Architecture

### 시스템 아키텍처

```mermaid
graph TB
    Frontend[Frontend Client] --> BFF[BFF :3000]
    BFF --> CommunityService[Community Service gRPC :50053]
    CommunityService --> Handler[gRPC Handler]
    Handler --> Service[Business Logic]
    Service --> Repository[Data Repository]
    Repository --> PostgreSQL[(PostgreSQL)]
```

### 레이어 구조

서비스는 다음과 같은 레이어로 구성됩니다:

1. **gRPC Handler Layer** (`internal/handler`): gRPC 요청/응답 처리
2. **Service Layer** (`internal/service`): 비즈니스 로직 구현
3. **Repository Layer** (`internal/repository`): 데이터베이스 접근

### 디렉토리 구조

```
backend/services/community/
├── main.go                    # gRPC 서버 진입점
├── Dockerfile                 # 컨테이너 이미지 정의
├── go.mod                     # Go 모듈 정의
├── pb/                       # Protocol Buffers 생성 코드
│   ├── community.pb.go
│   └── community_grpc.pb.go
├── internal/
│   ├── handler/              # gRPC 핸들러
│   │   └── community_handler.go
│   ├── service/              # 비즈니스 로직
│   │   └── community_service.go
│   └── repository/           # 데이터 접근
│       └── community_repository.go
└── migrations/               # 데이터베이스 마이그레이션
    └── 001_create_schema.sql
```

## Components and Interfaces

### 1. gRPC Handler

**책임**: gRPC 요청을 받아 서비스 레이어로 전달하고 Protobuf 응답을 반환합니다.

**인터페이스**:
```go
type CommunityHandler struct {
    pb.UnimplementedCommunityServiceServer
    service CommunityService
}

func (h *CommunityHandler) GetFeed(ctx context.Context, req *pb.GetFeedRequest) (*pb.FeedResponse, error)
func (h *CommunityHandler) GetPost(ctx context.Context, req *pb.GetPostRequest) (*pb.Post, error)
func (h *CommunityHandler) CreatePost(ctx context.Context, req *pb.CreatePostRequest) (*pb.Post, error)
func (h *CommunityHandler) UpdatePost(ctx context.Context, req *pb.UpdatePostRequest) (*pb.Post, error)
func (h *CommunityHandler) DeletePost(ctx context.Context, req *pb.DeletePostRequest) (*pb.DeletePostResponse, error)
func (h *CommunityHandler) GetComments(ctx context.Context, req *pb.GetCommentsRequest) (*pb.CommentsResponse, error)
func (h *CommunityHandler) CreateComment(ctx context.Context, req *pb.CreateCommentRequest) (*pb.Comment, error)
func (h *CommunityHandler) DeleteComment(ctx context.Context, req *pb.DeleteCommentRequest) (*pb.DeleteCommentResponse, error)
func (h *CommunityHandler) LikePost(ctx context.Context, req *pb.LikePostRequest) (*pb.LikePostResponse, error)
func (h *CommunityHandler) UnlikePost(ctx context.Context, req *pb.UnlikePostRequest) (*pb.UnlikePostResponse, error)
func (h *CommunityHandler) CheckLike(ctx context.Context, req *pb.CheckLikeRequest) (*pb.CheckLikeResponse, error)
func (h *CommunityHandler) GetNotices(ctx context.Context, req *pb.GetNoticesRequest) (*pb.NoticesResponse, error)
func (h *CommunityHandler) GetTopDetective(ctx context.Context, req *pb.GetTopDetectiveRequest) (*pb.TopDetectiveResponse, error)
func (h *CommunityHandler) GetHotTopic(ctx context.Context, req *pb.GetHotTopicRequest) (*pb.HotTopicResponse, error)
```

### 2. Community Service

**책임**: 커뮤니티 관련 비즈니스 로직을 처리합니다.

**인터페이스**:
```go
type CommunityService interface {
    GetFeed(ctx context.Context, page, pageSize int) (*Feed, error)
    GetPost(ctx context.Context, postID string) (*PostWithComments, error)
    CreatePost(ctx context.Context, req CreatePostRequest) (*Post, error)
    UpdatePost(ctx context.Context, postID, userID string, req UpdatePostRequest) (*Post, error)
    DeletePost(ctx context.Context, postID, userID string) error
    CreateComment(ctx context.Context, req CreateCommentRequest) (*Comment, error)
    DeleteComment(ctx context.Context, commentID, userID string) error
    LikePost(ctx context.Context, postID, userID string) (int, error)
    UnlikePost(ctx context.Context, postID, userID string) (int, error)
    GetPostsByTag(ctx context.Context, tag string, page, pageSize int) (*Feed, error)
    GetPostsByUser(ctx context.Context, userID string, page, pageSize int) (*Feed, error)
}
```

### 3. Repository

**책임**: 데이터베이스 CRUD 작업을 수행합니다.

**인터페이스**:
```go
type CommunityRepository interface {
    // Posts
    GetPosts(ctx context.Context, limit, offset int) ([]Post, int, error)
    GetPostByID(ctx context.Context, postID string) (*Post, error)
    CreatePost(ctx context.Context, post *Post) error
    UpdatePost(ctx context.Context, post *Post) error
    DeletePost(ctx context.Context, postID string) error
    GetPostsByTag(ctx context.Context, tag string, limit, offset int) ([]Post, int, error)
    GetPostsByUser(ctx context.Context, userID string, limit, offset int) ([]Post, int, error)
    
    // Comments
    GetCommentsByPostID(ctx context.Context, postID string) ([]Comment, error)
    CreateComment(ctx context.Context, comment *Comment) error
    DeleteComment(ctx context.Context, commentID string) error
    GetCommentByID(ctx context.Context, commentID string) (*Comment, error)
    
    // Likes
    AddLike(ctx context.Context, postID, userID string) error
    RemoveLike(ctx context.Context, postID, userID string) error
    IsLiked(ctx context.Context, postID, userID string) (bool, error)
    IncrementLikes(ctx context.Context, postID string) error
    DecrementLikes(ctx context.Context, postID string) error
}
```

## Data Models

### Post

```go
type Post struct {
    ID             string    `json:"id" db:"id"`
    UserID         string    `json:"userId" db:"user_id"`
    AuthorNickname string    `json:"authorNickname" db:"author_nickname"`
    AuthorEmoji    string    `json:"authorEmoji" db:"author_emoji"`
    Title          string    `json:"title" db:"title"`
    Body           string    `json:"body" db:"body"`
    Tags           []string  `json:"tags" db:"tags"`
    Likes          int       `json:"likes" db:"likes"`
    CreatedAt      time.Time `json:"createdAt" db:"created_at"`
    UpdatedAt      time.Time `json:"updatedAt" db:"updated_at"`
}
```

### Comment

```go
type Comment struct {
    ID             string    `json:"id" db:"id"`
    PostID         string    `json:"postId" db:"post_id"`
    UserID         string    `json:"userId" db:"user_id"`
    AuthorNickname string    `json:"authorNickname" db:"author_nickname"`
    AuthorEmoji    string    `json:"authorEmoji" db:"author_emoji"`
    Body           string    `json:"body" db:"body"`
    CreatedAt      time.Time `json:"createdAt" db:"created_at"`
}
```

### Feed

```go
type Feed struct {
    Posts      []PostWithCommentCount `json:"posts"`
    TotalCount int                    `json:"totalCount"`
    Page       int                    `json:"page"`
}

type PostWithCommentCount struct {
    Post
    Comments int `json:"comments"`
}
```

## gRPC API Methods

### 게시글 관련

| RPC Method | Description |
|------------|-------------|
| GetFeed | 게시글 피드 조회 (페이지네이션, 검색 지원) |
| GetPost | 게시글 상세 조회 |
| CreatePost | 게시글 작성 |
| UpdatePost | 게시글 수정 |
| DeletePost | 게시글 삭제 |

### 댓글 관련

| RPC Method | Description |
|------------|-------------|
| GetComments | 게시글의 댓글 목록 조회 |
| CreateComment | 댓글 작성 |
| DeleteComment | 댓글 삭제 |

### 좋아요 관련

| RPC Method | Description |
|------------|-------------|
| LikePost | 게시글 좋아요 |
| UnlikePost | 게시글 좋아요 취소 |
| CheckLike | 좋아요 상태 확인 |

### 대시보드 관련

| RPC Method | Description |
|------------|-------------|
| GetNotices | 공지사항 조회 |
| GetTopDetective | 탐정 랭킹 조회 |
| GetHotTopic | 인기 토픽 조회 |

## Database Schema

### community.posts

```sql
CREATE TABLE community.posts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    author_nickname VARCHAR(100) NOT NULL,
    author_emoji VARCHAR(10) NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_posts_created_at ON community.posts(created_at DESC);
CREATE INDEX idx_posts_user_id ON community.posts(user_id);
CREATE INDEX idx_posts_tags ON community.posts USING GIN(tags);
```

### community.comments

```sql
CREATE TABLE community.comments (
    id VARCHAR(255) PRIMARY KEY,
    post_id VARCHAR(255) NOT NULL REFERENCES community.posts(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    author_nickname VARCHAR(100) NOT NULL,
    author_emoji VARCHAR(10) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_post_id ON community.comments(post_id);
```

### community.post_likes

```sql
CREATE TABLE community.post_likes (
    post_id VARCHAR(255) NOT NULL REFERENCES community.posts(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_post_likes_post_id ON community.post_likes(post_id);
```

## Error Handling

### gRPC 상태 코드

- **OK**: 성공
- **INVALID_ARGUMENT**: 잘못된 요청 (필수 필드 누락, 유효성 검증 실패)
- **PERMISSION_DENIED**: 권한 없음 (다른 사용자의 게시글/댓글 수정/삭제 시도)
- **NOT_FOUND**: 리소스 없음
- **INTERNAL**: 서버 오류

### 에러 응답 형식

```go
import "google.golang.org/grpc/status"
import "google.golang.org/grpc/codes"

// 예시
return nil, status.Error(codes.NotFound, "Post not found")
return nil, status.Error(codes.InvalidArgument, "Title is required")
return nil, status.Error(codes.PermissionDenied, "Forbidden")
```

## Security Considerations

1. **권한 검증**: 게시글/댓글 수정/삭제 시 작성자 확인
2. **입력 검증**: 필수 필드 검증, SQL Injection 방지
3. **CORS 설정**: 허용된 Origin만 접근 가능
4. **Rate Limiting**: (향후 구현) API 호출 제한

## Performance Optimization

1. **인덱스**: created_at, user_id, tags, post_id에 인덱스 생성
2. **페이지네이션**: 대량 데이터 조회 시 메모리 효율성
3. **Connection Pooling**: 데이터베이스 연결 풀 사용
4. **Caching**: (향후 구현) Redis를 통한 인기 게시글 캐싱

## Deployment

### 환경 변수

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `PORT`: HTTP 서버 포트 (기본: 50053)
- `ALLOWED_ORIGINS`: CORS 허용 Origin (기본: *)

### Docker Compose

```yaml
community-service:
  build: ./services/community
  ports:
    - "50053:50053"
  environment:
    DATABASE_URL: postgres://pawfiler:dev_password@postgres:5432/pawfiler?sslmode=disable
  depends_on:
    - postgres
```

## Testing Strategy

1. **Unit Tests**: 각 레이어별 단위 테스트
2. **Integration Tests**: 데이터베이스 연동 테스트
3. **API Tests**: HTTP 엔드포인트 테스트
4. **Load Tests**: 성능 및 부하 테스트


## gRPC Migration Architecture

### 마이그레이션 개요

Community Service를 HTTP REST에서 gRPC로 마이그레이션하여 Quiz Service와 일관된 통신 프로토콜을 사용합니다. BFF(Backend for Frontend)가 모든 gRPC 서비스를 REST API로 변환하여 프론트엔드에 제공합니다.

### 새로운 아키텍처

```mermaid
graph TB
    Frontend[Frontend Client] --> BFF[BFF :3000]
    BFF --> QuizGRPC[Quiz Service gRPC :50052]
    BFF --> CommunityGRPC[Community Service gRPC :50053]
    QuizGRPC --> PostgreSQL[(PostgreSQL)]
    CommunityGRPC --> PostgreSQL
```

### gRPC 서비스 정의

**community.proto 업데이트:**

```protobuf
syntax = "proto3";

package community;

option go_package = "github.com/pawfiler/backend/services/community/pb";

service CommunityService {
  // 게시글 관리
  rpc GetFeed(GetFeedRequest) returns (FeedResponse);
  rpc GetPost(GetPostRequest) returns (Post);
  rpc CreatePost(CreatePostRequest) returns (Post);
  rpc UpdatePost(UpdatePostRequest) returns (Post);
  rpc DeletePost(DeletePostRequest) returns (DeletePostResponse);
  
  // 댓글 관리
  rpc GetComments(GetCommentsRequest) returns (CommentsResponse);
  rpc CreateComment(CreateCommentRequest) returns (Comment);
  rpc DeleteComment(DeleteCommentRequest) returns (DeleteCommentResponse);
  
  // 좋아요 관리
  rpc LikePost(LikePostRequest) returns (LikePostResponse);
  rpc UnlikePost(UnlikePostRequest) returns (UnlikePostResponse);
  rpc CheckLike(CheckLikeRequest) returns (CheckLikeResponse);
  
  // 대시보드 API
  rpc GetNotices(GetNoticesRequest) returns (NoticesResponse);
  rpc GetTopDetective(GetTopDetectiveRequest) returns (TopDetectiveResponse);
  rpc GetHotTopic(GetHotTopicRequest) returns (HotTopicResponse);
}

message Post {
  string id = 1;
  string author_id = 2;
  string author_nickname = 3;
  string author_emoji = 4;
  string title = 5;
  string body = 6;
  int32 likes = 7;
  int32 comments = 8;
  string created_at = 9;
  repeated string tags = 10;
}

message GetFeedRequest {
  int32 page = 1;
  int32 page_size = 2;
  string search = 3;
  string search_type = 4; // "title", "body", "all"
}

message FeedResponse {
  repeated Post posts = 1;
  int32 total_count = 2;
  int32 page = 3;
}

message CreatePostRequest {
  string user_id = 1;
  string author_nickname = 2;
  string author_emoji = 3;
  string title = 4;
  string body = 5;
  repeated string tags = 6;
}

message UpdatePostRequest {
  string post_id = 1;
  string title = 2;
  string body = 3;
  repeated string tags = 4;
}

message DeletePostRequest {
  string post_id = 1;
}

message DeletePostResponse {
  bool success = 1;
}

message Comment {
  string id = 1;
  string post_id = 2;
  string author_id = 3;
  string author_nickname = 4;
  string author_emoji = 5;
  string body = 6;
  string created_at = 7;
}

message GetCommentsRequest {
  string post_id = 1;
}

message CommentsResponse {
  repeated Comment comments = 1;
}

message CreateCommentRequest {
  string post_id = 1;
  string user_id = 2;
  string author_nickname = 3;
  string author_emoji = 4;
  string body = 5;
}

message DeleteCommentRequest {
  string comment_id = 1;
}

message DeleteCommentResponse {
  bool success = 1;
}

message LikePostRequest {
  string post_id = 1;
  string user_id = 2;
}

message LikePostResponse {
  bool success = 1;
  bool already_liked = 2;
}

message UnlikePostRequest {
  string post_id = 1;
  string user_id = 2;
}

message UnlikePostResponse {
  bool success = 1;
}

message CheckLikeRequest {
  string post_id = 1;
  string user_id = 2;
}

message CheckLikeResponse {
  bool liked = 1;
}

message GetPostRequest {
  string post_id = 1;
}

message GetNoticesRequest {}

message Notice {
  string id = 1;
  string title = 2;
}

message NoticesResponse {
  repeated Notice notices = 1;
}

message GetTopDetectiveRequest {}

message TopDetectiveResponse {
  string author_nickname = 1;
  string author_emoji = 2;
  int32 total_likes = 3;
}

message GetHotTopicRequest {}

message HotTopicResponse {
  string tag = 1;
  int32 count = 2;
}
```

### gRPC 서버 구현

**main.go 구조:**

```go
package main

import (
    "log"
    "net"
    "google.golang.org/grpc"
    pb "github.com/pawfiler/backend/services/community/pb"
)

type server struct {
    pb.UnimplementedCommunityServiceServer
    db *sql.DB
}

func main() {
    // 데이터베이스 연결
    db, err := initDB()
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
    
    // gRPC 서버 생성
    lis, err := net.Listen("tcp", ":50053")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }
    
    s := grpc.NewServer()
    pb.RegisterCommunityServiceServer(s, &server{db: db})
    
    log.Println("Community gRPC server listening on :50053")
    if err := s.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

### BFF 통합

**BFF에서 Community gRPC 클라이언트 사용:**

```javascript
// backend/bff/server.js

const communityProto = grpc.loadPackageDefinition(
  protoLoader.loadSync('../proto/community.proto')
).community;

const communityClient = new communityProto.CommunityService(
  'community-service:50053',
  grpc.credentials.createInsecure()
);

// REST → gRPC 변환
app.get('/api/community/feed', (req, res) => {
  const { page, pageSize, search, searchType } = req.query;
  
  communityClient.GetFeed({
    page: parseInt(page) || 1,
    page_size: parseInt(pageSize) || 15,
    search: search || '',
    search_type: searchType || 'title'
  }, (error, response) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});
```

### 마이그레이션 전략

1. **Proto 파일 업데이트**: 모든 엔드포인트를 proto에 정의
2. **Go 코드 생성**: `protoc`로 Go 코드 생성
3. **gRPC 서버 구현**: 기존 HTTP 핸들러를 gRPC 메서드로 변환
4. **BFF 업데이트**: HTTP proxy를 gRPC 클라이언트로 교체
5. **테스트**: 모든 엔드포인트 동작 확인
6. **배포**: docker-compose 업데이트

### 에러 처리

**gRPC 상태 코드 매핑:**

| HTTP Status | gRPC Status |
|-------------|-------------|
| 200 OK | OK |
| 400 Bad Request | INVALID_ARGUMENT |
| 403 Forbidden | PERMISSION_DENIED |
| 404 Not Found | NOT_FOUND |
| 500 Internal Server Error | INTERNAL |

```go
import "google.golang.org/grpc/codes"
import "google.golang.org/grpc/status"

// 예시
if post == nil {
    return nil, status.Error(codes.NotFound, "Post not found")
}
```

### 성능 고려사항

1. **Connection Pooling**: gRPC는 HTTP/2 기반으로 자동 멀티플렉싱
2. **Protobuf 직렬화**: JSON보다 빠르고 작은 메시지 크기
3. **스트리밍**: 향후 실시간 피드 업데이트에 활용 가능

### 호환성 유지

- 프론트엔드는 BFF의 REST API만 사용하므로 영향 없음
- BFF가 gRPC ↔ REST 변환을 담당
- 데이터베이스 스키마 변경 없음
