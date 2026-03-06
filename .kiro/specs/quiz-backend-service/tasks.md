# 구현 계획: 퀴즈 백엔드 서비스

## 개요

퀴즈 백엔드 서비스는 Go 언어와 gRPC를 사용하여 구현되는 마이크로서비스입니다. 4가지 질문 타입(객관식, OX, 영역선택, 비교)을 지원하며, PostgreSQL 데이터베이스를 활용합니다. 이 구현 계획은 프로젝트 설정부터 시작하여 각 컴포넌트를 단계적으로 구현하고, 테스트를 통해 검증하는 순서로 진행됩니다.

## 작업 목록

- [x] 1. 프로젝트 구조 및 의존성 설정
  - backend/services/quiz 디렉토리에 Go 모듈 초기화 (go mod init)
  - 필요한 의존성 추가 (gRPC, PostgreSQL 드라이버, gopter)
  - 디렉토리 구조 생성 (cmd/server, internal/handler, internal/service, internal/repository, proto)
  - _요구사항: 13.1, 13.2_

- [ ] 2. Protocol Buffer 정의 및 코드 생성
  - [x] 2.1 proto/quiz.proto 파일 작성
    - QuizService의 4개 RPC 메서드 정의 (GetRandomQuestion, GetQuestionById, SubmitAnswer, GetUserStats)
    - QuestionType 열거형 정의 (MULTIPLE_CHOICE, TRUE_FALSE, REGION_SELECT, COMPARISON)
    - 요청/응답 메시지 타입 정의
    - _요구사항: 1.1, 1.3, 1.4_
  
  - [x] 2.2 Protocol Buffer 코드 생성
    - protoc 명령어로 Go 코드 생성
    - 생성된 파일을 proto/ 디렉토리에 저장
    - _요구사항: 1.2_

- [ ] 3. 데이터베이스 스키마 및 마이그레이션
  - [x] 3.1 마이그레이션 스크립트 작성
    - migrations/001_create_schema.sql 파일 생성
    - quiz 스키마 생성
    - quiz.questions 테이블 생성 (모든 질문 타입 필드 포함)
    - quiz.user_answers 테이블 생성
    - quiz.user_stats 테이블 생성
    - 인덱스 및 외래 키 제약조건 추가
    - _요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 16.2, 16.3, 16.4, 16.5_

- [ ] 4. 데이터 모델 및 Repository 레이어 구현
  - [x] 4.1 Go 데이터 모델 정의
    - internal/repository/models.go 파일 생성
    - Question, UserAnswer, UserStats 구조체 정의
    - Region, Point 구조체 정의
    - Answer 인터페이스 및 구현 타입 정의
    - _요구사항: 2.1~2.10_
  
  - [x] 4.2 Repository 인터페이스 및 구현
    - internal/repository/quiz_repository.go 파일 생성
    - QuizRepository 인터페이스 정의
    - PostgreSQL 기반 구현 (GetRandomQuestion, GetQuestionById, SaveAnswer, GetUserStats, UpdateUserStats, CreateUserStats)
    - 난이도 및 타입 필터링 로직 구현
    - _요구사항: 3.1, 3.2, 3.3, 4.1, 9.1, 9.2, 9.3, 9.4, 12.1_
  
  - [ ] 4.3 Repository 유닛 테스트 작성
    - sqlmock을 사용한 데이터베이스 모킹
    - 각 메서드별 테스트 케이스 작성
    - 엣지 케이스 및 에러 조건 테스트

- [ ] 5. Answer Validator 구현
  - [x] 5.1 Validator 인터페이스 및 구현
    - internal/service/validator.go 파일 생성
    - AnswerValidator 인터페이스 정의
    - ValidateMultipleChoice 메서드 구현 (인덱스 범위 검증 포함)
    - ValidateTrueFalse 메서드 구현
    - ValidateRegionSelect 메서드 구현 (유클리드 거리 계산)
    - ValidateComparison 메서드 구현 (left/right 검증 포함)
    - _요구사항: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4_
  
  - [ ] 5.2 Validator 속성 기반 테스트 작성
    - **Property 7: 객관식 답변 검증**
    - **검증: 요구사항 5.2, 5.3**
  
  - [ ] 5.3 Validator 속성 기반 테스트 작성
    - **Property 8: 객관식 범위 검증**
    - **검증: 요구사항 5.4**
  
  - [ ] 5.4 Validator 속성 기반 테스트 작성
    - **Property 9: OX 답변 검증**
    - **검증: 요구사항 6.2, 6.3**
  
  - [ ] 5.5 Validator 속성 기반 테스트 작성
    - **Property 10: 영역선택 답변 검증**
    - **검증: 요구사항 7.3, 7.4**
  
  - [ ] 5.6 Validator 속성 기반 테스트 작성
    - **Property 11: 비교 답변 검증**
    - **검증: 요구사항 8.2, 8.3**
  
  - [ ] 5.7 Validator 속성 기반 테스트 작성
    - **Property 12: 비교 답변 입력 검증**
    - **검증: 요구사항 8.4**

- [ ] 6. Stats Tracker 구현
  - [x] 6.1 StatsTracker 인터페이스 및 구현
    - internal/service/stats_tracker.go 파일 생성
    - StatsTracker 인터페이스 정의
    - UpdateStats 메서드 구현 (정답/오답에 따른 통계 업데이트 로직)
    - GetStats 메서드 구현 (신규 사용자 기본값 처리 포함)
    - CorrectRate 계산 메서드 구현
    - 트랜잭션 처리로 데이터 일관성 보장
    - _요구사항: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.1, 12.3, 12.4_
  
  - [ ] 6.2 StatsTracker 속성 기반 테스트 작성
    - **Property 17: 총 답변 수 증가**
    - **검증: 요구사항 11.1**
  
  - [ ] 6.3 StatsTracker 속성 기반 테스트 작성
    - **Property 18: 정답 시 통계 업데이트**
    - **검증: 요구사항 11.2, 11.3**
  
  - [ ] 6.4 StatsTracker 속성 기반 테스트 작성
    - **Property 19: 오답 시 통계 업데이트**
    - **검증: 요구사항 11.4, 11.5**
  
  - [ ] 6.5 StatsTracker 속성 기반 테스트 작성
    - **Property 20: 최고 연속 정답 갱신**
    - **검증: 요구사항 11.6**
  
  - [ ] 6.6 StatsTracker 속성 기반 테스트 작성
    - **Property 21: 정답률 계산**
    - **검증: 요구사항 11.7**
  
  - [ ] 6.7 StatsTracker 유닛 테스트 작성
    - 신규 사용자 기본값 테스트
    - 생명이 0일 때 오답 처리 테스트
    - 엣지 케이스 테스트

- [ ] 7. Quiz Service 레이어 구현
  - [x] 7.1 QuizService 인터페이스 및 구현
    - internal/service/quiz_service.go 파일 생성
    - QuizService 인터페이스 정의
    - GetRandomQuestion 메서드 구현 (정답 정보 제외)
    - GetQuestionById 메서드 구현 (정답 정보 제외, NOT_FOUND 에러 처리)
    - GetUserStats 메서드 구현
    - _요구사항: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 12.1, 12.2, 12.3, 12.4_
  
  - [x] 7.2 SubmitAnswer 메서드 구현
    - 질문 타입별 답변 검증 (Validator 사용)
    - 보상 계산 (정답: 10 XP, 5 코인 / 오답: 0 XP, 0 코인)
    - 답변 저장 (Repository 사용)
    - 통계 업데이트 (StatsTracker 사용)
    - 에러 처리 (INVALID_ARGUMENT, INTERNAL)
    - _요구사항: 5.1~5.4, 6.1~6.3, 7.1~7.5, 8.1~8.4, 9.1~9.4, 10.1~10.4, 11.1~11.8, 14.1~14.5_
  
  - [ ] 7.3 QuizService 속성 기반 테스트 작성
    - **Property 1: 랜덤 질문 조회 성공**
    - **검증: 요구사항 3.1**
  
  - [ ] 7.4 QuizService 속성 기반 테스트 작성
    - **Property 2: 난이도 필터링**
    - **검증: 요구사항 3.2**
  
  - [ ] 7.5 QuizService 속성 기반 테스트 작성
    - **Property 3: 질문 타입 필터링**
    - **검증: 요구사항 3.3**
  
  - [ ] 7.6 QuizService 속성 기반 테스트 작성
    - **Property 4: 정답 정보 비노출**
    - **검증: 요구사항 3.5, 3.6, 3.7, 3.8**
  
  - [ ] 7.7 QuizService 속성 기반 테스트 작성
    - **Property 5: ID로 질문 조회**
    - **검증: 요구사항 4.1**
  
  - [ ] 7.8 QuizService 속성 기반 테스트 작성
    - **Property 6: 존재하지 않는 질문 조회 에러**
    - **검증: 요구사항 4.3**
  
  - [ ] 7.9 QuizService 속성 기반 테스트 작성
    - **Property 16: 보상 계산**
    - **검증: 요구사항 10.1, 10.2, 10.3**
  
  - [ ] 7.10 QuizService 유닛 테스트 작성
    - SubmitAnswer 통합 플로우 테스트
    - 각 질문 타입별 답변 제출 테스트
    - 에러 조건 테스트

- [x] 8. 체크포인트 - 핵심 비즈니스 로직 검증
  - 모든 테스트가 통과하는지 확인
  - 질문이 있으면 사용자에게 문의

- [ ] 9. gRPC Handler 레이어 구현
  - [x] 9.1 QuizHandler 구조체 및 메서드 구현
    - internal/handler/quiz_handler.go 파일 생성
    - QuizHandler 구조체 정의 (QuizService 의존성 주입)
    - GetRandomQuestion RPC 핸들러 구현
    - GetQuestionById RPC 핸들러 구현
    - SubmitAnswer RPC 핸들러 구현
    - GetUserStats RPC 핸들러 구현
    - protobuf 메시지 변환 로직 구현
    - gRPC 에러 코드 매핑 (NOT_FOUND, INVALID_ARGUMENT, INTERNAL)
    - _요구사항: 3.1~3.8, 4.1~4.4, 12.1~12.4, 14.1~14.5_
  
  - [ ] 9.2 Handler 유닛 테스트 작성
    - 각 RPC 메서드별 테스트
    - 에러 응답 테스트
    - protobuf 변환 테스트

- [ ] 10. 서버 초기화 및 main 함수 구현
  - [x] 10.1 cmd/server/main.go 파일 작성
    - 환경 변수 로딩 (데이터베이스 연결 정보, 포트)
    - PostgreSQL 데이터베이스 연결 초기화
    - 의존성 주입 (Repository, Validator, StatsTracker, Service, Handler)
    - gRPC 서버 생성 및 포트 50052에서 시작
    - 헬스체크 구현 (데이터베이스 연결 대기)
    - 에러 처리 및 로깅
    - Graceful shutdown 구현
    - _요구사항: 13.1, 13.2, 13.3, 13.4, 16.5_

- [ ] 11. Docker 컨테이너화
  - [x] 11.1 Dockerfile 작성
    - 멀티스테이지 빌드 구성 (빌드 스테이지, 실행 스테이지)
    - Go 바이너리 빌드
    - 최소 이미지 크기 최적화 (alpine 또는 distroless 사용)
    - _요구사항: 16.1, 16.2_
  
  - [x] 11.2 docker-compose.yml 업데이트
    - quiz-service 서비스 정의
    - PostgreSQL과의 네트워크 구성
    - 환경 변수 설정
    - 의존성 설정 (depends_on)
    - _요구사항: 16.3, 16.4_

- [ ] 12. 통합 테스트 및 최종 검증
  - [ ] 12.1 통합 테스트 작성
    - Docker Compose로 전체 스택 실행
    - gRPC 클라이언트로 엔드투엔드 테스트
    - 각 RPC 메서드 호출 및 응답 검증
    - 데이터베이스 상태 확인
  
  - [x] 12.2 README.md 작성
    - 프로젝트 개요 및 아키텍처 설명
    - 로컬 개발 환경 설정 방법
    - 빌드 및 실행 명령어
    - 테스트 실행 방법
    - API 문서 (gRPC 메서드 설명)

- [x] 13. 최종 체크포인트
  - 모든 테스트가 통과하는지 확인
  - Docker Compose로 서비스가 정상 실행되는지 확인
  - 질문이 있으면 사용자에게 문의

## 참고사항

- `*` 표시가 있는 작업은 선택 사항이며, 빠른 MVP를 위해 건너뛸 수 있습니다
- 각 작업은 특정 요구사항을 참조하여 추적 가능성을 보장합니다
- 체크포인트는 점진적 검증을 위해 포함되었습니다
- 속성 기반 테스트는 보편적 정확성 속성을 검증합니다
- 유닛 테스트는 특정 예제와 엣지 케이스를 검증합니다
