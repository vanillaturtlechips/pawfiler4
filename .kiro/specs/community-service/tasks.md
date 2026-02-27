# 구현 계획: 커뮤니티 서비스

## 개요

커뮤니티 서비스는 Go 언어와 REST API를 사용하여 구현되는 마이크로서비스입니다. 게시글, 댓글, 좋아요 기능을 제공하며, PostgreSQL 데이터베이스를 활용합니다. 이 구현 계획은 프로젝트 설정부터 시작하여 각 컴포넌트를 단계적으로 구현하고, 테스트를 통해 검증하는 순서로 진행됩니다.

## 작업 목록

- [ ] 1. 프로젝트 구조 및 의존성 설정
  - backend/services/community 디렉토리에 Go 모듈 초기화 (go mod init)
  - 필요한 의존성 추가 (net/http, PostgreSQL 드라이버, gorilla/mux 등)
  - 디렉토리 구조 생성 (internal/handler, internal/service, internal/repository, internal/middleware, migrations)
  - _요구사항: 15.1, 15.2_

- [ ] 2. 데이터베이스 스키마 및 마이그레이션
  - [ ] 2.1 마이그레이션 스크립트 작성
    - migrations/001_create_schema.sql 파일 생성
    - community 스키마 생성
    - community.posts 테이블 생성 (id, user_id, author_nickname, author_emoji, title, body, tags, likes, created_at, updated_at)
    - community.comments 테이블 생성 (id, post_id, user_id, author_nickname, author_emoji, body, created_at)
    - community.post_likes 테이블 생성 (post_id, user_id, created_at)
    - 외래 키 제약조건 추가 (comments.post_id → posts.id, post_likes.post_id → posts.id)
    - 인덱스 생성 (created_at, user_id, tags GIN, post_id)
    - _요구사항: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 14.1, 14.2, 14.3, 14.4, 14.5_
  
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

- [ ] 5. HTTP Handler 레이어 구현
  - [ ] 5.1 CommunityHandler 구조체 및 메서드 구현
    - internal/handler/community_handler.go 파일 생성
    - CommunityHandler 구조체 정의 (CommunityService 의존성 주입)
    - GetFeed 핸들러 구현 (쿼리 파라미터 파싱)
    - GetPost 핸들러 구현
    - CreatePost 핸들러 구현 (JSON 파싱, 유효성 검증)
    - UpdatePost 핸들러 구현
    - DeletePost 핸들러 구현
    - _요구사항: 2.1~2.7, 3.1~3.5, 4.1~4.7, 5.1~5.7, 6.1~6.7_
  
  - [ ] 5.2 댓글 및 좋아요 핸들러 구현
    - CreateComment 핸들러 구현
    - DeleteComment 핸들러 구현
    - LikePost 핸들러 구현
    - UnlikePost 핸들러 구현
    - GetPostsByTag 핸들러 구현
    - GetPostsByUser 핸들러 구현
    - _요구사항: 7.1~7.6, 8.1~8.5, 9.1~9.6, 10.1~10.5, 11.1~11.5, 12.1~12.5_
  
  - [ ] 5.3 에러 응답 헬퍼 함수 구현
    - respondError 함수 구현 (상태 코드별 JSON 응답)
    - respondJSON 함수 구현 (성공 응답)
    - _요구사항: 16.1, 16.2, 16.3, 16.4, 16.5_
  
  - [ ] 5.4 Handler 유닛 테스트 작성
    - httptest를 사용한 HTTP 테스트
    - 각 엔드포인트별 테스트
    - 에러 응답 테스트

- [ ] 6. CORS 미들웨어 구현
  - [ ] 6.1 CORS 미들웨어 작성
    - internal/middleware/cors.go 파일 생성
    - CORS 헤더 설정 미들웨어 구현
    - OPTIONS 요청 처리
    - _요구사항: 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [ ] 6.2 CORS 미들웨어 테스트
    - OPTIONS 요청 테스트
    - CORS 헤더 검증 테스트

- [ ] 7. 서버 초기화 및 main 함수 구현
  - [ ] 7.1 main.go 파일 작성
    - 환경 변수 로딩 (DATABASE_URL, PORT, ALLOWED_ORIGINS)
    - PostgreSQL 데이터베이스 연결 초기화
    - 데이터베이스 연결 재시도 로직 구현
    - 의존성 주입 (Repository, Service, Handler)
    - HTTP 라우터 설정 (gorilla/mux 또는 net/http)
    - 모든 엔드포인트 등록
    - CORS 미들웨어 적용
    - HTTP 서버 시작 (포트 50053)
    - Graceful shutdown 구현
    - _요구사항: 15.1, 15.2, 15.3, 15.4, 15.5_
  
  - [ ] 7.2 헬스체크 엔드포인트 추가
    - /health 엔드포인트 구현
    - 데이터베이스 연결 상태 확인

- [ ] 8. Docker 컨테이너화
  - [ ] 8.1 Dockerfile 작성
    - 멀티스테이지 빌드 구성 (빌드 스테이지, 실행 스테이지)
    - Go 바이너리 빌드
    - 최소 이미지 크기 최적화 (alpine 사용)
    - _요구사항: 17.1, 17.2_
  
  - [ ] 8.2 docker-compose.yml 업데이트
    - community-service 서비스 정의
    - PostgreSQL과의 네트워크 구성
    - 환경 변수 설정
    - 의존성 설정 (depends_on: postgres)
    - 포트 매핑 (50053:50053)
    - _요구사항: 17.3, 17.4, 17.5_

- [ ] 9. 통합 테스트 및 최종 검증
  - [ ] 9.1 통합 테스트 작성
    - Docker Compose로 전체 스택 실행
    - HTTP 클라이언트로 엔드투엔드 테스트
    - 각 엔드포인트 호출 및 응답 검증
    - 데이터베이스 상태 확인
    - 권한 검증 테스트
    - 페이지네이션 테스트
  
  - [ ] 9.2 README.md 작성
    - 프로젝트 개요 및 아키텍처 설명
    - 로컬 개발 환경 설정 방법
    - 빌드 및 실행 명령어
    - 테스트 실행 방법
    - API 문서 (엔드포인트 설명)
    - 환경 변수 설명

- [ ] 10. 최종 체크포인트
  - 모든 테스트가 통과하는지 확인
  - Docker Compose로 서비스가 정상 실행되는지 확인
  - 프론트엔드와 연동 테스트
  - 질문이 있으면 사용자에게 문의

## 현재 상태 분석

### 기존 구현 확인

현재 `backend/services/community/main.go`에는 **간단한 인메모리 구현**이 존재합니다:
- ✅ HTTP 서버 기본 구조
- ✅ CORS 미들웨어
- ✅ 기본 엔드포인트 (GetFeed, CreatePost, UpdatePost, DeletePost)
- ❌ PostgreSQL 연동 없음 (인메모리 배열 사용)
- ❌ 댓글 기능 없음
- ❌ 좋아요 기능 없음
- ❌ 필터링 기능 없음
- ❌ 권한 검증 없음
- ❌ 레이어 분리 없음 (Handler, Service, Repository)

### 마이그레이션 전략

기존 코드를 유지하면서 점진적으로 개선:
1. 먼저 레이어 구조 생성 (Repository, Service, Handler)
2. PostgreSQL 연결 추가
3. 기존 엔드포인트를 새 구조로 이전
4. 누락된 기능 추가 (댓글, 좋아요, 필터링)
5. 테스트 작성

## 참고사항

- 각 작업은 특정 요구사항을 참조하여 추적 가능성을 보장합니다
- 기존 인메모리 구현을 PostgreSQL 기반으로 전환하는 것이 핵심 작업입니다
- 테스트 작성을 통해 리팩토링 안정성을 확보합니다
- 프론트엔드와의 호환성을 유지하기 위해 API 응답 형식을 동일하게 유지합니다
