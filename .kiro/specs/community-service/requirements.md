# 요구사항 문서

## 소개

커뮤니티 서비스는 딥페이크 탐지 교육 플랫폼의 사용자 간 정보 공유 및 소통을 위한 REST API 기반 마이크로서비스입니다. 게시글 작성, 조회, 수정, 삭제 기능과 댓글, 좋아요 기능을 제공하며, PostgreSQL 데이터베이스를 사용합니다.

## 용어 정의

- **Community_Service**: 커뮤니티 관련 비즈니스 로직을 처리하는 REST API 서비스
- **Post**: 사용자가 작성한 게시글
- **Comment**: 게시글에 달린 댓글
- **Feed**: 게시글 목록 (페이지네이션 지원)
- **Tag**: 게시글 분류를 위한 태그
- **Like**: 게시글에 대한 좋아요
- **Database**: PostgreSQL 데이터베이스
- **CORS**: Cross-Origin Resource Sharing (프론트엔드 연동을 위한 설정)
- **Pagination**: 페이지 단위로 데이터를 나누어 조회하는 기능

## 요구사항

### 요구사항 1: 데이터베이스 스키마 설계

**사용자 스토리:** 개발자로서, 게시글과 댓글을 저장할 수 있는 데이터베이스 스키마가 필요합니다.

#### 인수 기준

1. THE Database SHALL community.posts 테이블을 생성하여 게시글 데이터를 저장한다
2. THE community.posts 테이블 SHALL id, user_id, author_nickname, author_emoji, title, body, likes, created_at, updated_at 컬럼을 포함한다
3. THE community.posts 테이블 SHALL tags 컬럼을 JSONB 타입으로 포함한다
4. THE Database SHALL community.comments 테이블을 생성하여 댓글 데이터를 저장한다
5. THE community.comments 테이블 SHALL id, post_id, user_id, author_nickname, author_emoji, body, created_at 컬럼을 포함한다
6. THE Database SHALL community.post_likes 테이블을 생성하여 좋아요 데이터를 저장한다
7. THE community.post_likes 테이블 SHALL post_id, user_id, created_at 컬럼을 포함한다
8. THE community.post_likes 테이블 SHALL (post_id, user_id) 복합 유니크 제약조건을 가진다

### 요구사항 2: 게시글 피드 조회

**사용자 스토리:** 사용자로서, 최신 게시글 목록을 페이지 단위로 조회하고 싶습니다.

#### 인수 기준

1. WHEN GET /community.CommunityService/GetFeed 요청이 들어오면, THE Community_Service SHALL Database로부터 게시글 목록을 조회한다
2. THE Community_Service SHALL 게시글을 created_at 기준 내림차순으로 정렬한다
3. WHERE page 파라미터가 제공되면, THE Community_Service SHALL 해당 페이지의 게시글을 반환한다
4. WHERE page_size 파라미터가 제공되면, THE Community_Service SHALL 해당 개수만큼 게시글을 반환한다
5. THE Community_Service SHALL 각 게시글의 댓글 개수를 함께 반환한다
6. THE Community_Service SHALL 전체 게시글 개수(totalCount)를 함께 반환한다
7. THE Community_Service SHALL 기본 page_size를 10으로 설정한다

### 요구사항 3: 게시글 상세 조회

**사용자 스토리:** 사용자로서, 특정 게시글의 상세 내용과 댓글을 조회하고 싶습니다.

#### 인수 기준

1. WHEN GET /community.CommunityService/GetPost 요청이 들어오면, THE Community_Service SHALL post_id로 게시글을 조회한다
2. WHEN 게시글이 존재하면, THE Community_Service SHALL 게시글 정보를 반환한다
3. WHEN 게시글이 존재하지 않으면, THE Community_Service SHALL 404 에러를 반환한다
4. THE Community_Service SHALL 해당 게시글의 모든 댓글을 함께 반환한다
5. THE Community_Service SHALL 댓글을 created_at 기준 오름차순으로 정렬한다

### 요구사항 4: 게시글 작성

**사용자 스토리:** 사용자로서, 새로운 게시글을 작성하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/CreatePost 요청이 들어오면, THE Community_Service SHALL 새 게시글을 생성한다
2. THE Community_Service SHALL user_id, author_nickname, author_emoji, title, body, tags를 입력받는다
3. WHERE title이 비어있으면, THE Community_Service SHALL 400 에러를 반환한다
4. WHERE body가 비어있으면, THE Community_Service SHALL 400 에러를 반환한다
5. THE Community_Service SHALL 생성된 게시글의 초기 likes를 0으로 설정한다
6. THE Community_Service SHALL 생성된 게시글 정보를 반환한다
7. THE Community_Service SHALL created_at을 현재 시각으로 설정한다

### 요구사항 5: 게시글 수정

**사용자 스토리:** 사용자로서, 내가 작성한 게시글을 수정하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/UpdatePost 요청이 들어오면, THE Community_Service SHALL 게시글을 수정한다
2. THE Community_Service SHALL post_id, user_id, title, body, tags를 입력받는다
3. WHERE 게시글이 존재하지 않으면, THE Community_Service SHALL 404 에러를 반환한다
4. WHERE user_id가 게시글 작성자와 다르면, THE Community_Service SHALL 403 에러를 반환한다
5. THE Community_Service SHALL title, body, tags를 업데이트한다
6. THE Community_Service SHALL updated_at을 현재 시각으로 설정한다
7. THE Community_Service SHALL 수정된 게시글 정보를 반환한다

### 요구사항 6: 게시글 삭제

**사용자 스토리:** 사용자로서, 내가 작성한 게시글을 삭제하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/DeletePost 요청이 들어오면, THE Community_Service SHALL 게시글을 삭제한다
2. THE Community_Service SHALL post_id, user_id를 입력받는다
3. WHERE 게시글이 존재하지 않으면, THE Community_Service SHALL 404 에러를 반환한다
4. WHERE user_id가 게시글 작성자와 다르면, THE Community_Service SHALL 403 에러를 반환한다
5. THE Community_Service SHALL 게시글과 연관된 모든 댓글을 함께 삭제한다
6. THE Community_Service SHALL 게시글과 연관된 모든 좋아요를 함께 삭제한다
7. THE Community_Service SHALL 성공 응답을 반환한다

### 요구사항 7: 댓글 작성

**사용자 스토리:** 사용자로서, 게시글에 댓글을 작성하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/CreateComment 요청이 들어오면, THE Community_Service SHALL 새 댓글을 생성한다
2. THE Community_Service SHALL post_id, user_id, author_nickname, author_emoji, body를 입력받는다
3. WHERE post_id에 해당하는 게시글이 없으면, THE Community_Service SHALL 404 에러를 반환한다
4. WHERE body가 비어있으면, THE Community_Service SHALL 400 에러를 반환한다
5. THE Community_Service SHALL 생성된 댓글 정보를 반환한다
6. THE Community_Service SHALL created_at을 현재 시각으로 설정한다

### 요구사항 8: 댓글 삭제

**사용자 스토리:** 사용자로서, 내가 작성한 댓글을 삭제하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/DeleteComment 요청이 들어오면, THE Community_Service SHALL 댓글을 삭제한다
2. THE Community_Service SHALL comment_id, user_id를 입력받는다
3. WHERE 댓글이 존재하지 않으면, THE Community_Service SHALL 404 에러를 반환한다
4. WHERE user_id가 댓글 작성자와 다르면, THE Community_Service SHALL 403 에러를 반환한다
5. THE Community_Service SHALL 성공 응답을 반환한다

### 요구사항 9: 게시글 좋아요

**사용자 스토리:** 사용자로서, 마음에 드는 게시글에 좋아요를 누르고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/LikePost 요청이 들어오면, THE Community_Service SHALL 좋아요를 추가한다
2. THE Community_Service SHALL post_id, user_id를 입력받는다
3. WHERE post_id에 해당하는 게시글이 없으면, THE Community_Service SHALL 404 에러를 반환한다
4. WHERE 이미 좋아요를 눌렀으면, THE Community_Service SHALL 중복 추가하지 않는다
5. THE Community_Service SHALL posts 테이블의 likes 카운트를 1 증가시킨다
6. THE Community_Service SHALL 업데이트된 likes 개수를 반환한다

### 요구사항 10: 게시글 좋아요 취소

**사용자 스토리:** 사용자로서, 좋아요를 취소하고 싶습니다.

#### 인수 기준

1. WHEN POST /community.CommunityService/UnlikePost 요청이 들어오면, THE Community_Service SHALL 좋아요를 제거한다
2. THE Community_Service SHALL post_id, user_id를 입력받는다
3. WHERE 좋아요가 존재하지 않으면, THE Community_Service SHALL 아무 작업도 하지 않는다
4. THE Community_Service SHALL posts 테이블의 likes 카운트를 1 감소시킨다
5. THE Community_Service SHALL 업데이트된 likes 개수를 반환한다

### 요구사항 11: 태그별 게시글 조회

**사용자 스토리:** 사용자로서, 특정 태그가 포함된 게시글만 조회하고 싶습니다.

#### 인수 기준

1. WHEN GET /community.CommunityService/GetPostsByTag 요청이 들어오면, THE Community_Service SHALL 태그로 게시글을 필터링한다
2. THE Community_Service SHALL tag 파라미터를 입력받는다
3. THE Community_Service SHALL tags JSONB 컬럼에서 해당 태그를 포함하는 게시글을 조회한다
4. THE Community_Service SHALL 페이지네이션을 지원한다
5. THE Community_Service SHALL 게시글을 created_at 기준 내림차순으로 정렬한다

### 요구사항 12: 사용자별 게시글 조회

**사용자 스토리:** 사용자로서, 특정 사용자가 작성한 모든 게시글을 조회하고 싶습니다.

#### 인수 기준

1. WHEN GET /community.CommunityService/GetPostsByUser 요청이 들어오면, THE Community_Service SHALL 사용자별 게시글을 조회한다
2. THE Community_Service SHALL user_id 파라미터를 입력받는다
3. THE Community_Service SHALL 해당 user_id로 작성된 모든 게시글을 조회한다
4. THE Community_Service SHALL 페이지네이션을 지원한다
5. THE Community_Service SHALL 게시글을 created_at 기준 내림차순으로 정렬한다

### 요구사항 13: CORS 설정

**사용자 스토리:** 개발자로서, 프론트엔드에서 API를 호출할 수 있도록 CORS를 설정해야 합니다.

#### 인수 기준

1. THE Community_Service SHALL 모든 엔드포인트에 CORS 헤더를 추가한다
2. THE Community_Service SHALL Access-Control-Allow-Origin을 설정한다
3. THE Community_Service SHALL Access-Control-Allow-Methods를 GET, POST, OPTIONS로 설정한다
4. THE Community_Service SHALL Access-Control-Allow-Headers를 Content-Type, Authorization으로 설정한다
5. THE Community_Service SHALL OPTIONS 요청에 200 응답을 반환한다

### 요구사항 14: 데이터베이스 인덱스

**사용자 스토리:** 개발자로서, 조회 성능을 최적화하기 위한 인덱스가 필요합니다.

#### 인수 기준

1. THE Database SHALL posts 테이블의 created_at 컬럼에 인덱스를 생성한다
2. THE Database SHALL posts 테이블의 user_id 컬럼에 인덱스를 생성한다
3. THE Database SHALL posts 테이블의 tags 컬럼에 GIN 인덱스를 생성한다
4. THE Database SHALL comments 테이블의 post_id 컬럼에 인덱스를 생성한다
5. THE Database SHALL post_likes 테이블의 post_id 컬럼에 인덱스를 생성한다

### 요구사항 15: 서버 초기화

**사용자 스토리:** 개발자로서, 서비스가 안정적으로 시작되고 의존성이 올바르게 주입되어야 합니다.

#### 인수 기준

1. THE Community_Service SHALL 환경 변수로부터 데이터베이스 연결 정보를 로드한다
2. THE Community_Service SHALL PostgreSQL 데이터베이스에 연결한다
3. THE Community_Service SHALL 데이터베이스 연결 실패 시 재시도한다
4. THE Community_Service SHALL 포트 50053에서 HTTP 서버를 시작한다
5. THE Community_Service SHALL Graceful shutdown을 지원한다

### 요구사항 16: 에러 처리

**사용자 스토리:** 개발자로서, 일관된 에러 응답 형식이 필요합니다.

#### 인수 기준

1. THE Community_Service SHALL 400 에러 시 {"error": "message"} 형식으로 응답한다
2. THE Community_Service SHALL 403 에러 시 {"error": "Forbidden"} 형식으로 응답한다
3. THE Community_Service SHALL 404 에러 시 {"error": "Not found"} 형식으로 응답한다
4. THE Community_Service SHALL 500 에러 시 {"error": "Internal server error"} 형식으로 응답한다
5. THE Community_Service SHALL 모든 에러를 로그에 기록한다

### 요구사항 17: Docker 컨테이너화

**사용자 스토리:** 개발자로서, 서비스를 Docker 컨테이너로 실행할 수 있어야 합니다.

#### 인수 기준

1. THE Community_Service SHALL Dockerfile을 제공한다
2. THE Dockerfile SHALL 멀티스테이지 빌드를 사용한다
3. THE Community_Service SHALL docker-compose.yml에 정의된다
4. THE Community_Service SHALL PostgreSQL 서비스에 의존성을 가진다
5. THE Community_Service SHALL 환경 변수로 설정을 주입받는다


### 요구사항 18: gRPC 프로토콜 마이그레이션

**사용자 스토리:** 개발자로서, Community Service를 HTTP REST에서 gRPC로 마이그레이션하여 BFF와 일관된 통신 프로토콜을 사용하고 싶습니다.

#### 인수 기준

1. THE Community_Service SHALL gRPC 프로토콜을 사용하여 통신한다
2. THE Community_Service SHALL community.proto 파일에 정의된 서비스 인터페이스를 구현한다
3. THE Community_Service SHALL 모든 기존 HTTP 엔드포인트를 gRPC 메서드로 변환한다
4. THE Community_Service SHALL Protocol Buffers를 사용하여 메시지를 직렬화한다
5. THE Community_Service SHALL 포트 50053에서 gRPC 서버를 실행한다
6. THE Community_Service SHALL gRPC 에러 코드를 사용하여 에러를 반환한다
7. THE Community_Service SHALL 기존 데이터베이스 스키마를 유지한다
8. THE Community_Service SHALL 기존 비즈니스 로직을 유지한다

### 요구사항 19: Proto 파일 완성

**사용자 스토리:** 개발자로서, 모든 Community API를 정의하는 완전한 proto 파일이 필요합니다.

#### 인수 기준

1. THE community.proto SHALL UpdatePost RPC 메서드를 정의한다
2. THE community.proto SHALL DeletePost RPC 메서드를 정의한다
3. THE community.proto SHALL DeleteComment RPC 메서드를 정의한다
4. THE community.proto SHALL UnlikePost RPC 메서드를 정의한다
5. THE community.proto SHALL CheckLike RPC 메서드를 정의한다
6. THE community.proto SHALL GetNotices RPC 메서드를 정의한다
7. THE community.proto SHALL GetTopDetective RPC 메서드를 정의한다
8. THE community.proto SHALL GetHotTopic RPC 메서드를 정의한다
9. THE community.proto SHALL 검색 기능을 위한 필드를 GetFeedRequest에 추가한다
10. THE community.proto SHALL author_id 필드를 Post 메시지에 추가한다

### 요구사항 20: BFF 통합

**사용자 스토리:** 개발자로서, BFF가 Community Service를 gRPC로 호출할 수 있어야 합니다.

#### 인수 기준

1. THE BFF SHALL community.proto를 사용하여 gRPC 클라이언트를 생성한다
2. THE BFF SHALL Community Service에 gRPC 연결을 설정한다
3. THE BFF SHALL 모든 Community API를 REST로 노출한다
4. THE BFF SHALL gRPC 응답을 JSON으로 변환한다
5. THE BFF SHALL gRPC 에러를 HTTP 상태 코드로 변환한다
6. THE BFF SHALL 기존 프론트엔드 API 호환성을 유지한다
