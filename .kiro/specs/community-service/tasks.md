# 구현 계획: 커뮤니티 서비스

## 개요

커뮤니티 서비스는 Go 언어와 gRPC를 사용하여 구현되는 마이크로서비스입니다. 게시글, 댓글, 좋아요 기능을 제공하며, PostgreSQL 데이터베이스를 활용합니다. BFF(Backend for Frontend)가 gRPC를 REST API로 변환하여 프론트엔드에 제공합니다. 이 구현 계획은 프로젝트 설정부터 시작하여 각 컴포넌트를 단계적으로 구현하고, 테스트를 통해 검증하는 순서로 진행됩니다.

## 작업 목록

- [ ] 1. 프로젝트 구조 및 의존성 설정
  - backend/services/community 디렉토리에 Go 모듈 초기화 (go mod init)
  - 필요한 의존성 추가 (google.golang.org/grpc, google.golang.org/protobuf, PostgreSQL 드라이버 등)
  - 디렉토리 구조 생성 (internal/handler, internal/service, internal/repository, pb/, migrations)
  - _요구사항: 15.1, 15.2_

- [ ] 2. 데이터베이스 스키마 및 마이그레이션
  - [ ] 2.1 마이그레이션 스크립트 작성
    - migrations/001_create_schema.sql 파일 생성
    - community 스키마 생성
    - community.posts 테이블 생성 (id, user_id, author_nickname, author_emoji, title, body, tags TEXT[], likes, created_at, updated_at)
    - community.comments 테이블 생성 (id, post_id, user_id, author_nickname, author_emoji, body, created_at)
    - community.post_likes 테이블 생성 (post_id, user_id, created_at)
    - 외래 키 제약조건 추가 (comments.post_id → posts.id, post_likes.post_id → posts.id)
    - 인덱스 생성 (created_at, user_id, tags GIN, post_id)
    - _요구사항: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 18.1, 18.2, 18.3, 18.4, 18.5_
  
  - [ ] 2.2 샘플 데이터 삽입
    - migrations/002_insert_sample_data.sql 파일 생성
    - 테스트용 게시글 10개 삽입
    - 테스트용 댓글 20개 삽입

- [ ] 3. 데이터 모델 및 Repository 레이어 구현
  - [ ] 3.1 Go 데이터 모델 정의
    - internal/repository/models.go 파일 생성
    - Post, Comment, PostLike 구조체 정의
    - Feed, PostWithCommentCount, PostWithComments 구조체 정의
    - _요구사항: 1.1~1.8_
  
  - [ ] 3.2 Repository 인터페이스 및 구현
    - internal/repository/community_repository.go 파일 생성
    - CommunityRepository 인터페이스 정의
    - PostgreSQL 기반 구현
    - 게시글 CRUD 메서드 구현 (GetPosts, GetPostByID, CreatePost, UpdatePost, DeletePost)
    - 댓글 CRUD 메서드 구현 (GetCommentsByPostID, CreateComment, DeleteComment, GetCommentByID)
    - 좋아요 메서드 구현 (AddLike, RemoveLike, IsLiked, IncrementLikes, DecrementLikes)
    - 필터링 메서드 구현 (GetPostsByTag, GetPostsByUser)
    - _요구사항: 2.1, 2.2, 2.5, 3.1, 3.4, 11.3, 12.3_
  
  - [ ] 3.3 Repository 유닛 테스트 작성
    - sqlmock을 사용한 데이터베이스 모킹
    - 각 메서드별 테스트 케이스 작성
    - 엣지 케이스 및 에러 조건 테스트

- [ ] 4. Service 레이어 구현
  - [ ] 4.1 CommunityService 인터페이스 및 구현
    - internal/service/community_service.go 파일 생성
    - CommunityService 인터페이스 정의
    - GetFeed 메서드 구현 (페이지네이션, 댓글 개수 포함)
    - GetPost 메서드 구현 (댓글 목록 포함, NOT_FOUND 처리)
    - _요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ] 4.2 게시글 작성/수정/삭제 메서드 구현
    - CreatePost 메서드 구현 (유효성 검증, 초기값 설정)
    - UpdatePost 메서드 구현 (권한 검증, NOT_FOUND/FORBIDDEN 처리)
    - DeletePost 메서드 구현 (권한 검증, 연관 데이터 삭제)
    - _요구사항: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  
  - [ ] 4.3 댓글 작성/삭제 메서드 구현
    - CreateComment 메서드 구현 (유효성 검증, 게시글 존재 확인)
    - DeleteComment 메서드 구현 (권한 검증)
    - _요구사항: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 4.4 좋아요 메서드 구현
    - LikePost 메서드 구현 (중복 방지, 카운트 증가)
    - UnlikePost 메서드 구현 (카운트 감소)
    - _요구사항: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 4.5 필터링 메서드 구현
    - GetPostsByTag 메서드 구현 (JSONB 쿼리, 페이지네이션)
    - GetPostsByUser 메서드 구현 (페이지네이션)
    - _요구사항: 11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5_
  
  - [ ] 4.6 Service 유닛 테스트 작성
    - 각 메서드별 테스트 케이스
    - 권한 검증 테스트
    - 에러 조건 테스트

- [ ] 5. gRPC Handler 레이어 구현
  - [ ] 5.1 CommunityHandler 구조체 및 메서드 구현
    - internal/handler/community_handler.go 파일 생성
    - CommunityHandler 구조체 정의 (pb.UnimplementedCommunityServiceServer 임베딩, CommunityService 의존성 주입)
    - GetFeed gRPC 메서드 구현
    - GetPost gRPC 메서드 구현
    - CreatePost gRPC 메서드 구현 (유효성 검증)
    - UpdatePost gRPC 메서드 구현
    - DeletePost gRPC 메서드 구현
    - _요구사항: 2.1~2.11, 3.1~3.4, 4.1~4.7, 5.1~5.7, 6.1~6.7_
  
  - [ ] 5.2 댓글 및 좋아요 gRPC 메서드 구현
    - GetComments gRPC 메서드 구현
    - CreateComment gRPC 메서드 구현
    - DeleteComment gRPC 메서드 구현
    - LikePost gRPC 메서드 구현
    - UnlikePost gRPC 메서드 구현
    - CheckLike gRPC 메서드 구현
    - _요구사항: 7.1~7.6, 8.1~8.6, 9.1~9.5, 10.1~10.5, 11.1~11.5, 12.1~12.3_
  
  - [ ] 5.3 대시보드 API gRPC 메서드 구현
    - GetNotices gRPC 메서드 구현
    - GetTopDetective gRPC 메서드 구현
    - GetHotTopic gRPC 메서드 구현
    - _요구사항: 15.1~15.3, 16.1~16.3, 17.1~17.4_
  
  - [ ] 5.4 gRPC 에러 처리 구현
    - status.Error() 사용하여 gRPC 상태 코드 반환
    - INVALID_ARGUMENT, PERMISSION_DENIED, NOT_FOUND, INTERNAL 에러 처리
    - _요구사항: 20.1, 20.2, 20.3, 20.4, 20.5_
  
  - [ ] 5.5 Handler 유닛 테스트 작성
    - 각 gRPC 메서드별 테스트
    - 에러 응답 테스트

- [ ] 6. 서버 초기화 및 main 함수 구현
  - [ ] 6.1 main.go 파일 작성
    - 환경 변수 로딩 (DATABASE_URL, PORT)
    - PostgreSQL 데이터베이스 연결 초기화
    - 데이터베이스 연결 재시도 로직 구현
    - 의존성 주입 (Repository, Service, Handler)
    - gRPC 서버 초기화
    - CommunityServiceServer 등록
    - gRPC 서버 시작 (포트 50053)
    - Graceful shutdown 구현
    - _요구사항: 19.1, 19.2, 19.3, 19.4, 19.5_
  
  - [ ] 6.2 헬스체크 구현
    - gRPC health check 프로토콜 구현 (선택사항)
    - 데이터베이스 연결 상태 확인

- [ ] 7. Docker 컨테이너화
  - [ ] 7.1 Dockerfile 작성
    - 멀티스테이지 빌드 구성 (빌드 스테이지, 실행 스테이지)
    - Go 바이너리 빌드
    - 최소 이미지 크기 최적화 (alpine 사용)
    - _요구사항: 21.1, 21.2_
  
  - [ ] 7.2 docker-compose.yml 업데이트
    - community-service 서비스 정의
    - PostgreSQL과의 네트워크 구성
    - 환경 변수 설정
    - 의존성 설정 (depends_on: postgres)
    - 포트 매핑 (50053:50053)
    - _요구사항: 21.3, 21.4, 21.5_

- [ ] 8. 통합 테스트 및 최종 검증
  - [ ] 8.1 통합 테스트 작성
    - Docker Compose로 전체 스택 실행
    - gRPC 클라이언트로 엔드투엔드 테스트
    - 각 RPC 메서드 호출 및 응답 검증
    - 데이터베이스 상태 확인
    - 권한 검증 테스트
    - 페이지네이션 테스트
  
  - [ ] 8.2 README.md 작성
    - 프로젝트 개요 및 아키텍처 설명
    - 로컬 개발 환경 설정 방법
    - 빌드 및 실행 명령어
    - 테스트 실행 방법
    - gRPC API 문서 (RPC 메서드 설명)
    - 환경 변수 설명

- [ ] 9. 최종 체크포인트
  - 모든 테스트가 통과하는지 확인
  - Docker Compose로 서비스가 정상 실행되는지 확인
  - BFF와 연동 테스트
  - 질문이 있으면 사용자에게 문의

## 현재 상태 분석

### 기존 구현 확인

현재 `backend/services/community/main.go`에는 **간단한 인메모리 HTTP 구현**이 존재합니다:
- ✅ HTTP 서버 기본 구조
- ✅ CORS 미들웨어
- ✅ 기본 엔드포인트 (GetFeed, CreatePost, UpdatePost, DeletePost)
- ❌ PostgreSQL 연동 없음 (인메모리 배열 사용)
- ❌ 댓글 기능 없음
- ❌ 좋아요 기능 없음
- ❌ 필터링 기능 없음
- ❌ 권한 검증 없음
- ❌ 레이어 분리 없음 (Handler, Service, Repository)
- ❌ gRPC 프로토콜 없음

### 마이그레이션 전략

기존 HTTP 구현을 gRPC로 완전히 재구현:
1. community.proto 파일 업데이트 (모든 RPC 메서드 정의)
2. Proto 파일 컴파일하여 Go 코드 생성
3. 레이어 구조 생성 (Repository, Service, gRPC Handler)
4. PostgreSQL 연결 추가
5. 모든 gRPC 메서드 구현
6. BFF에서 gRPC 클라이언트로 Community Service 호출
7. 테스트 작성

## 참고사항

- 각 작업은 특정 요구사항을 참조하여 추적 가능성을 보장합니다
- 기존 인메모리 HTTP 구현을 PostgreSQL 기반 gRPC로 전환하는 것이 핵심 작업입니다
- BFF가 gRPC를 REST API로 변환하여 프론트엔드 호환성을 유지합니다
- 테스트 작성을 통해 리팩토링 안정성을 확보합니다
- Task 1-9: 기본 gRPC 서버 구현
- Task 10-14: gRPC 마이그레이션 및 BFF 통합


## gRPC 마이그레이션 작업

- [x] 10. community.proto 파일 업데이트
  - [x] 10.1 누락된 RPC 메서드 추가
    - UpdatePost RPC 메서드 및 메시지 정의
    - DeletePost RPC 메서드 및 메시지 정의
    - GetComments RPC 메서드 및 메시지 정의
    - DeleteComment RPC 메서드 및 메시지 정의
    - UnlikePost RPC 메서드 및 메시지 정의
    - CheckLike RPC 메서드 및 메시지 정의
    - GetNotices RPC 메서드 및 메시지 정의
    - GetTopDetective RPC 메서드 및 메시지 정의
    - GetHotTopic RPC 메서드 및 메시지 정의
    - GetPostsByTag RPC 메서드 및 메시지 정의
    - GetPostsByUser RPC 메서드 및 메시지 정의
    - _요구사항: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.10, 23.11_
  
  - [x] 10.2 기존 메시지 타입 업데이트
    - Post 메시지에 author_id 필드 추가
    - GetFeedRequest에 search_query, search_type 필드 추가
    - Comment 메시지에 author_id 필드 추가
    - _요구사항: 23.12, 23.13_
  
  - [x] 10.3 Proto 파일 컴파일
    - `protoc` 명령어로 Go 코드 생성
    - `backend/services/community/pb/` 디렉토리에 생성된 파일 확인
    - _요구사항: 22.2, 22.4_

- [x] 11. Community Service gRPC 서버 구현
  - [x] 11.1 gRPC 서버 구조 생성
    - main.go를 gRPC 서버로 변경
    - CommunityServiceServer 인터페이스 구현
    - 데이터베이스 연결 유지
    - gRPC 서버 초기화 및 시작 (포트 50053)
    - _요구사항: 22.1, 22.5, 22.7_
  
  - [x] 11.2 게시글 관련 gRPC 메서드 구현
    - GetFeed 메서드 구현 (검색 기능 포함)
    - GetPost 메서드 구현
    - CreatePost 메서드 구현
    - UpdatePost 메서드 구현
    - DeletePost 메서드 구현
    - _요구사항: 22.3, 22.8_
  
  - [x] 11.3 댓글 관련 gRPC 메서드 구현
    - GetComments 메서드 구현
    - CreateComment 메서드 구현
    - DeleteComment 메서드 구현
    - _요구사항: 22.3, 22.8_
  
  - [x] 11.4 좋아요 관련 gRPC 메서드 구현
    - LikePost 메서드 구현
    - UnlikePost 메서드 구현
    - CheckLike 메서드 구현
    - _요구사항: 22.3, 22.8_
  
  - [x] 11.5 대시보드 API gRPC 메서드 구현
    - GetNotices 메서드 구현
    - GetTopDetective 메서드 구현
    - GetHotTopic 메서드 구현
    - GetPostsByTag 메서드 구현
    - GetPostsByUser 메서드 구현
    - _요구사항: 22.3, 22.8_
  
  - [x] 11.6 gRPC 에러 처리 구현
    - HTTP 상태 코드를 gRPC 상태 코드로 변환
    - status.Error() 사용하여 에러 반환
    - _요구사항: 22.6_

- [x] 12. BFF Community gRPC 클라이언트 구현
  - [x] 12.1 BFF에 community.proto 추가
    - proto 파일 로드
    - gRPC 클라이언트 생성
    - Community Service 연결 설정
    - _요구사항: 24.1, 24.2_
  
  - [x] 12.2 기존 HTTP proxy를 gRPC 클라이언트로 교체
    - 모든 Community 엔드포인트를 gRPC 호출로 변경
    - gRPC 응답을 JSON으로 변환
    - gRPC 에러를 HTTP 상태 코드로 변환
    - _요구사항: 24.3, 24.4, 24.5_
  
  - [x] 12.3 API 호환성 테스트
    - 기존 프론트엔드 API 호출이 정상 동작하는지 확인
    - 응답 형식이 동일한지 확인
    - _요구사항: 24.6_

- [x] 13. 통합 테스트 및 검증
  - [x] 13.1 gRPC 서버 단위 테스트
    - 각 gRPC 메서드별 테스트
    - 에러 조건 테스트
    - 데이터베이스 연동 테스트
  
  - [x] 13.2 BFF 통합 테스트
    - BFF → Community gRPC 호출 테스트
    - REST API 응답 검증
    - 에러 처리 테스트
  
  - [x] 13.3 엔드투엔드 테스트
    - Docker Compose로 전체 스택 실행
    - 프론트엔드에서 모든 Community API 호출
    - 데이터 일관성 확인

- [x] 14. Docker 및 배포 설정 업데이트
  - [x] 14.1 Community Service Dockerfile 업데이트
    - gRPC 서버 빌드 설정
    - 포트 50053 노출
  
  - [x] 14.2 docker-compose.yml 업데이트
    - Community Service 환경 변수 확인
    - BFF와 Community Service 네트워크 연결 확인
  
  - [x] 14.3 최종 배포 테스트
    - `docker-compose up --build` 실행
    - 모든 서비스 정상 시작 확인
    - 프론트엔드 연동 테스트
