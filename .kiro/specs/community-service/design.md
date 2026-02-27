# 커뮤니티 서비스 설계 문서

## Overview

커뮤니티 서비스는 딥페이크 탐지 교육 플랫폼의 사용자 간 정보 공유 및 소통을 위한 REST API 기반 마이크로서비스입니다. 게시글 작성, 조회, 수정, 삭제, 댓글, 좋아요 기능을 제공하며, PostgreSQL 데이터베이스를 사용합니다.

### 핵심 기능

- **게시글 관리**: CRUD 작업 (생성, 조회, 수정, 삭제)
- **댓글 시스템**: 게시글에 댓글 작성 및 삭제
- **좋아요 기능**: 게시글 좋아요/취소
- **피드 조회**: 페이지네이션 지원
- **필터링**: 태그별, 사용자별 게시글 조회
- **권한 관리**: 작성자만 수정/삭제 가능

### 기술 스택

- **언어**: Go 1.21+
- **프로토콜**: REST API (JSON)
- **데이터베이스**: PostgreSQL 15+
- **컨테이너화**: Docker, Docker Compose

## Architecture

### 시스템 아키텍처

```mermaid
graph TB
    Client[Frontend Client] --> CommunityService[Community Service]
    CommunityService --> Handler[HTTP Handler]
    Handler --> Service[Business Logic]
    Service --> Repository[Data Repository]
    Repository --> PostgreSQL[(PostgreSQL)]
```

### 레이어 구조

서비스는 다음과 같은 레이어로 구성됩니다:

1. **Handler Layer** (`internal/handler`): HTTP 요청/응답 처리
2. **Service Layer** (`internal/service`): 비즈니스 로직 구현
3. **Repository Layer** (`internal/repository`): 데이터베이스 접근

### 디렉토리 구조

```
backend/services/community/
├── main.go                    # 서비스 진입점
├── Dockerfile                 # 컨테이너 이미지 정의
├── go.mod                     # Go 모듈 정의
├── internal/
│   ├── handler/              # HTTP 핸들러
│   │   └── community_handler.go
│   ├── service/              # 비즈니스 로직
│   │   └── community_service.go
│   ├── repository/           # 데이터 접근
│   │   └── community_repository.go
│   └── middleware/           # CORS 등 미들웨어
│       └── cors.go
└── migrations/               # 데이터베이스 마이그레이션
    └── 001_create_schema.sql
```

## Components and Interfaces

### 1. HTTP Handler

**책임**: HTTP 요청을 받아 서비스 레이어로 전달하고 JSON 응답을 반환합니다.

**인터페이스**:
```go
type CommunityHandler struct {
    service CommunityService
}

func (h *CommunityHandler) GetFeed(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) GetPost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) CreatePost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) UpdatePost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) DeletePost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) CreateComment(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) DeleteComment(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) LikePost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) UnlikePost(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) GetPostsByTag(w http.ResponseWriter, r *http.Request)
func (h *CommunityHandler) GetPostsByUser(w http.ResponseWriter, r *http.Request)
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

## API Endpoints

### 게시글 관련

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/community.CommunityService/GetFeed` | 게시글 피드 조회 |
| POST | `/community.CommunityService/GetPost` | 게시글 상세 조회 |
| POST | `/community.CommunityService/CreatePost` | 게시글 작성 |
| POST | `/community.CommunityService/UpdatePost` | 게시글 수정 |
| POST | `/community.CommunityService/DeletePost` | 게시글 삭제 |
| POST | `/community.CommunityService/GetPostsByTag` | 태그별 게시글 조회 |
| POST | `/community.CommunityService/GetPostsByUser` | 사용자별 게시글 조회 |

### 댓글 관련

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/community.CommunityService/CreateComment` | 댓글 작성 |
| POST | `/community.CommunityService/DeleteComment` | 댓글 삭제 |

### 좋아요 관련

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/community.CommunityService/LikePost` | 게시글 좋아요 |
| POST | `/community.CommunityService/UnlikePost` | 게시글 좋아요 취소 |

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
    tags JSONB DEFAULT '[]'::jsonb,
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

### HTTP 상태 코드

- **200 OK**: 성공
- **400 Bad Request**: 잘못된 요청 (필수 필드 누락, 유효성 검증 실패)
- **403 Forbidden**: 권한 없음 (다른 사용자의 게시글/댓글 수정/삭제 시도)
- **404 Not Found**: 리소스 없음
- **500 Internal Server Error**: 서버 오류

### 에러 응답 형식

```json
{
  "error": "Error message"
}
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
