# Quiz Backend Service

퀴즈 백엔드 서비스는 딥페이크 탐지 교육을 위한 인터랙티브 퀴즈 시스템을 제공하는 gRPC 기반 마이크로서비스입니다.

## 개요

이 서비스는 4가지 질문 타입(객관식, OX, 영역선택, 비교)을 지원하며, 사용자 답변 검증, 통계 추적, 보상 계산, 이벤트 발행 기능을 제공합니다.

### 주요 기능

- **질문 관리**: 4가지 타입의 퀴즈 질문 조회 (랜덤 또는 ID 기반)
- **답변 검증**: 각 질문 타입에 맞는 답변 검증 로직
- **통계 추적**: 사용자별 정답률, 연속 정답, 생명 관리
- **보상 시스템**: 정답 시 XP와 코인 부여
- **이벤트 발행**: Kafka를 통한 퀴즈 이벤트 발행

### 기술 스택

- **언어**: Go 1.24+
- **프로토콜**: gRPC (Protocol Buffers)
- **데이터베이스**: PostgreSQL 16+
- **메시지 브로커**: Apache Kafka
- **컨테이너화**: Docker, Docker Compose

## 아키텍처

### 시스템 구조

```
┌─────────────┐
│ gRPC Client │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Envoy Proxy │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│         Quiz Service                 │
│                                      │
│  ┌────────────────────────────────┐ │
│  │      gRPC Handler Layer        │ │
│  └────────────┬───────────────────┘ │
│               │                      │
│  ┌────────────▼───────────────────┐ │
│  │      Service Layer             │ │
│  │  ┌──────────────────────────┐  │ │
│  │  │ Answer Validator         │  │ │
│  │  │ Stats Tracker            │  │ │
│  │  │ Event Publisher          │  │ │
│  │  └──────────────────────────┘  │ │
│  └────────────┬───────────────────┘ │
│               │                      │
│  ┌────────────▼───────────────────┐ │
│  │      Repository Layer          │ │
│  └────────────┬───────────────────┘ │
└───────────────┼──────────────────────┘
                │
       ┌────────┴────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│ PostgreSQL  │   │    Kafka    │
└─────────────┘   └─────────────┘
```

### 레이어 구조

1. **Handler Layer** (`internal/handler`): gRPC 요청/응답 처리
2. **Service Layer** (`internal/service`): 비즈니스 로직 구현
3. **Repository Layer** (`internal/repository`): 데이터베이스 접근
4. **Infrastructure Layer** (`pkg`): Kafka, 로깅 등 인프라 컴포넌트

### 디렉토리 구조

```
backend/services/quiz/
├── main.go                    # 서비스 진입점
├── Dockerfile                 # 컨테이너 이미지 정의
├── go.mod                     # Go 모듈 정의
├── go.sum                     # 의존성 체크섬
├── README.md                  # 이 문서
├── proto/                     # 생성된 protobuf 코드
│   ├── quiz.pb.go
│   └── quiz_grpc.pb.go
├── migrations/                # 데이터베이스 마이그레이션
│   └── 001_create_schema.sql
├── internal/
│   ├── handler/              # gRPC 핸들러
│   │   ├── quiz_handler.go
│   │   └── quiz_handler_test.go
│   ├── service/              # 비즈니스 로직
│   │   ├── quiz_service.go
│   │   ├── quiz_service_test.go
│   │   ├── validator.go
│   │   ├── validator_test.go
│   │   ├── stats_tracker.go
│   │   └── stats_tracker_test.go
│   └── repository/           # 데이터 접근
│       ├── quiz_repository.go
│       └── models.go
└── pkg/
    └── kafka/                # Kafka 프로듀서
        └── producer.go
```

## 로컬 개발 환경 설정

### 사전 요구사항

- Go 1.24 이상
- Docker 및 Docker Compose
- Protocol Buffers 컴파일러 (protoc)
- PostgreSQL 클라이언트 (선택사항, 디버깅용)

### 1. 저장소 클론

```bash
git clone <repository-url>
cd backend/services/quiz
```

### 2. 의존성 설치

```bash
go mod download
```

### 3. Protocol Buffer 코드 생성 (선택사항)

proto 파일이 수정된 경우에만 필요합니다:

```bash
# backend/proto 디렉토리에서 실행
protoc --go_out=../services/quiz --go_opt=paths=source_relative \
       --go-grpc_out=../services/quiz --go-grpc_opt=paths=source_relative \
       quiz.proto
```

### 4. 환경 변수 설정

`.env` 파일을 생성하거나 환경 변수를 직접 설정합니다:

```bash
# 데이터베이스 설정
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=pawfiler
export DB_PASSWORD=dev_password
export DB_NAME=pawfiler

# Kafka 설정
export KAFKA_BROKERS=localhost:9092

# 서버 설정
export GRPC_PORT=50052
```

### 5. 데이터베이스 마이그레이션

PostgreSQL이 실행 중인지 확인한 후 마이그레이션을 실행합니다:

```bash
# PostgreSQL 접속
psql -h localhost -U pawfiler -d pawfiler

# 마이그레이션 실행
\i migrations/001_create_schema.sql
```

또는 Docker Compose를 사용하는 경우 자동으로 실행됩니다.

## 빌드 및 실행

### 로컬에서 직접 실행

```bash
# 빌드
go build -o quiz-service ./main.go

# 실행
./quiz-service
```

### Docker로 실행

```bash
# 이미지 빌드
docker build -t pawfiler-quiz:latest .

# 컨테이너 실행
docker run -p 50052:50052 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_USER=pawfiler \
  -e DB_PASSWORD=dev_password \
  -e DB_NAME=pawfiler \
  -e KAFKA_BROKERS=host.docker.internal:9092 \
  pawfiler-quiz:latest
```

### Docker Compose로 전체 스택 실행

전체 마이크로서비스 스택을 실행하려면:

```bash
# backend 디렉토리에서 실행
cd backend
docker-compose up -d

# 로그 확인
docker-compose logs -f quiz-service

# 중지
docker-compose down
```

서비스는 다음 포트에서 실행됩니다:
- Quiz Service: `50052`
- PostgreSQL: `5432`
- Kafka: `9092`
- Envoy Proxy: `8080`

## 테스트

### 유닛 테스트 실행

```bash
# 모든 테스트 실행
go test ./... -v

# 특정 패키지 테스트
go test ./internal/service -v

# 커버리지 리포트 생성
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### 속성 기반 테스트 실행

```bash
# 속성 테스트만 실행
go test ./... -v -run Property

# 특정 속성 테스트
go test ./internal/service -v -run TestMultipleChoiceValidation
```

### 통합 테스트 실행

```bash
# Docker Compose로 전체 스택 시작
docker-compose up -d

# 통합 테스트 실행
go test ./tests/integration -v

# 스택 종료
docker-compose down
```

## API 문서

### gRPC 서비스 정의

Quiz Service는 4개의 RPC 메서드를 제공합니다:

#### 1. GetRandomQuestion

랜덤한 퀴즈 질문을 조회합니다. 난이도와 질문 타입으로 필터링할 수 있습니다.

**요청**:
```protobuf
message GetRandomQuestionRequest {
  string user_id = 1;
  optional string difficulty = 2;  // "EASY", "MEDIUM", "HARD"
  optional QuestionType type = 3;  // MULTIPLE_CHOICE, TRUE_FALSE, REGION_SELECT, COMPARISON
}
```

**응답**:
```protobuf
message QuizQuestion {
  string id = 1;
  QuestionType type = 2;
  MediaType media_type = 3;
  string media_url = 4;
  string thumbnail_emoji = 5;
  string difficulty = 6;
  string category = 7;
  string explanation = 8;
  
  // 질문 타입별 필드 (정답 정보는 제외됨)
  repeated string options = 10;              // Multiple Choice
  repeated Region correct_regions = 13;      // Region Select (정답 제외)
  optional string comparison_media_url = 15; // Comparison
}
```

**예제**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123",
  "difficulty": "EASY",
  "type": "MULTIPLE_CHOICE"
}' localhost:50052 quiz.QuizService/GetRandomQuestion
```

#### 2. GetQuestionById

특정 ID로 질문을 조회합니다.

**요청**:
```protobuf
message GetQuestionByIdRequest {
  string question_id = 1;
}
```

**응답**: `QuizQuestion` (GetRandomQuestion과 동일)

**예제**:
```bash
grpcurl -plaintext -d '{
  "question_id": "550e8400-e29b-41d4-a716-446655440000"
}' localhost:50052 quiz.QuizService/GetQuestionById
```

#### 3. SubmitAnswer

사용자 답변을 제출하고 검증합니다.

**요청**:
```protobuf
message SubmitAnswerRequest {
  string user_id = 1;
  string question_id = 2;
  
  // 질문 타입에 따라 하나만 설정
  optional int32 selected_index = 3;      // Multiple Choice
  optional bool selected_answer = 4;      // True/False
  optional Point selected_region = 5;     // Region Select
  optional string selected_side = 6;      // Comparison ("left" or "right")
}
```

**응답**:
```protobuf
message SubmitAnswerResponse {
  bool correct = 1;           // 정답 여부
  int32 xp_earned = 2;        // 획득한 XP (정답: 10, 오답: 0)
  int32 coins_earned = 3;     // 획득한 코인 (정답: 5, 오답: 0)
  string explanation = 4;     // 해설
  int32 streak_count = 5;     // 현재 연속 정답 수
}
```

**예제 - 객관식**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123",
  "question_id": "550e8400-e29b-41d4-a716-446655440000",
  "selected_index": 2
}' localhost:50052 quiz.QuizService/SubmitAnswer
```

**예제 - OX**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123",
  "question_id": "550e8400-e29b-41d4-a716-446655440001",
  "selected_answer": true
}' localhost:50052 quiz.QuizService/SubmitAnswer
```

**예제 - 영역선택**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123",
  "question_id": "550e8400-e29b-41d4-a716-446655440002",
  "selected_region": {"x": 150, "y": 200}
}' localhost:50052 quiz.QuizService/SubmitAnswer
```

**예제 - 비교**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123",
  "question_id": "550e8400-e29b-41d4-a716-446655440003",
  "selected_side": "left"
}' localhost:50052 quiz.QuizService/SubmitAnswer
```

#### 4. GetUserStats

사용자의 퀴즈 통계를 조회합니다.

**요청**:
```protobuf
message GetUserStatsRequest {
  string user_id = 1;
}
```

**응답**:
```protobuf
message QuizStats {
  int32 total_answered = 1;   // 총 답변 수
  double correct_rate = 2;    // 정답률 (0.0 ~ 1.0)
  int32 current_streak = 3;   // 현재 연속 정답 수
  int32 best_streak = 4;      // 최고 연속 정답 수
  int32 lives = 5;            // 남은 생명 (오답 시 감소)
}
```

**예제**:
```bash
grpcurl -plaintext -d '{
  "user_id": "user-123"
}' localhost:50052 quiz.QuizService/GetUserStats
```

### 질문 타입

#### 1. MULTIPLE_CHOICE (객관식)

여러 선택지 중 하나를 선택하는 질문입니다.

- **필드**: `options` (선택지 배열), `correct_index` (정답 인덱스, 서버에서만 사용)
- **답변**: `selected_index` (선택한 인덱스)
- **검증**: 선택한 인덱스가 정답 인덱스와 일치하는지 확인

#### 2. TRUE_FALSE (OX)

참/거짓을 선택하는 질문입니다.

- **필드**: `correct_answer` (정답, 서버에서만 사용)
- **답변**: `selected_answer` (선택한 답변)
- **검증**: 선택한 답변이 정답과 일치하는지 확인

#### 3. REGION_SELECT (영역선택)

이미지/비디오에서 특정 영역을 선택하는 질문입니다.

- **필드**: `correct_regions` (정답 영역 배열), `tolerance` (허용 오차)
- **답변**: `selected_region` (선택한 좌표)
- **검증**: 선택한 좌표가 정답 영역 중 하나의 (radius + tolerance) 범위 내에 있는지 유클리드 거리로 계산

#### 4. COMPARISON (비교)

두 미디어를 비교하여 하나를 선택하는 질문입니다.

- **필드**: `comparison_media_url` (비교할 두 번째 미디어), `correct_side` (정답 측면, 서버에서만 사용)
- **답변**: `selected_side` ("left" 또는 "right")
- **검증**: 선택한 측면이 정답 측면과 일치하는지 확인

### 에러 코드

서비스는 다음 gRPC 상태 코드를 반환합니다:

- `OK (0)`: 성공
- `INVALID_ARGUMENT (3)`: 잘못된 파라미터 (예: 범위를 벗어난 인덱스, 잘못된 측면 값)
- `NOT_FOUND (5)`: 질문을 찾을 수 없음
- `INTERNAL (13)`: 서버 내부 에러 (데이터베이스 에러 등)

## 데이터베이스 스키마

### quiz.questions

퀴즈 질문을 저장하는 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 질문 ID (Primary Key) |
| type | VARCHAR(20) | 질문 타입 (MULTIPLE_CHOICE, TRUE_FALSE, REGION_SELECT, COMPARISON) |
| media_type | VARCHAR(10) | 미디어 타입 (VIDEO, IMAGE) |
| media_url | TEXT | 미디어 URL |
| thumbnail_emoji | VARCHAR(10) | 썸네일 이모지 |
| difficulty | VARCHAR(20) | 난이도 (EASY, MEDIUM, HARD) |
| category | VARCHAR(50) | 카테고리 |
| explanation | TEXT | 해설 |
| options | TEXT[] | 객관식 선택지 배열 |
| correct_index | INTEGER | 객관식 정답 인덱스 |
| correct_answer | BOOLEAN | OX 정답 |
| correct_regions | JSONB | 영역선택 정답 영역 배열 |
| tolerance | INTEGER | 영역선택 허용 오차 |
| comparison_media_url | TEXT | 비교 질문 두 번째 미디어 URL |
| correct_side | VARCHAR(10) | 비교 질문 정답 측면 (left, right) |

### quiz.user_answers

사용자 답변 이력을 저장하는 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 답변 ID (Primary Key) |
| user_id | UUID | 사용자 ID |
| question_id | UUID | 질문 ID (Foreign Key) |
| answer_data | JSONB | 답변 데이터 |
| is_correct | BOOLEAN | 정답 여부 |
| xp_earned | INTEGER | 획득한 XP |
| coins_earned | INTEGER | 획득한 코인 |
| answered_at | TIMESTAMP | 답변 시각 |

### quiz.user_stats

사용자 퀴즈 통계를 저장하는 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| user_id | UUID | 사용자 ID (Primary Key) |
| total_answered | INTEGER | 총 답변 수 |
| correct_count | INTEGER | 정답 수 |
| current_streak | INTEGER | 현재 연속 정답 수 |
| best_streak | INTEGER | 최고 연속 정답 수 |
| lives | INTEGER | 남은 생명 |
| updated_at | TIMESTAMP | 업데이트 시각 |

## 이벤트 발행

서비스는 답변이 성공적으로 처리되면 Kafka를 통해 `quiz.answered` 이벤트를 발행합니다.

### 이벤트 구조

```json
{
  "user_id": "user-123",
  "question_id": "550e8400-e29b-41d4-a716-446655440000",
  "correct": true,
  "xp_earned": 10,
  "coins_earned": 5,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 토픽

- **토픽 이름**: `pawfiler-events`
- **파티션**: 1 (개발 환경)
- **복제 팩터**: 1 (개발 환경)

### 에러 처리

이벤트 발행이 실패하더라도 답변 처리는 성공으로 간주됩니다. 실패한 이벤트는 로그에 기록되며, 재시도 로직이 적용됩니다 (최대 3회, 지수 백오프).

## 모니터링 및 로깅

### 헬스체크

서비스는 gRPC 헬스체크 프로토콜을 지원합니다:

```bash
grpcurl -plaintext localhost:50052 grpc.health.v1.Health/Check
```

### 로그 형식

서비스는 구조화된 로그를 출력합니다:

```
[INFO] /quiz.QuizService/GetRandomQuestion - OK (took 15ms)
[ERROR] /quiz.QuizService/SubmitAnswer - Question not found (took 5ms)
[PANIC] /quiz.QuizService/GetUserStats - Recovered from panic: runtime error
```

### 메트릭

서비스는 다음 메트릭을 추적합니다 (향후 Prometheus 통합 예정):

- RPC 요청 수
- RPC 응답 시간
- 에러 발생 수
- 데이터베이스 쿼리 시간
- Kafka 이벤트 발행 성공/실패 수

## 트러블슈팅

### 데이터베이스 연결 실패

```
Failed to initialize database: failed to ping database
```

**해결 방법**:
1. PostgreSQL이 실행 중인지 확인: `docker-compose ps postgres`
2. 연결 정보가 올바른지 확인: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`
3. 네트워크 연결 확인: `ping <DB_HOST>`

### Kafka 연결 실패

```
Failed to publish event: kafka: client has run out of available brokers
```

**해결 방법**:
1. Kafka가 실행 중인지 확인: `docker-compose ps kafka`
2. Kafka 브로커 주소 확인: `KAFKA_BROKERS`
3. Zookeeper가 실행 중인지 확인: `docker-compose ps zookeeper`

### 포트 충돌

```
Failed to listen on port 50052: address already in use
```

**해결 방법**:
1. 포트를 사용 중인 프로세스 확인: `lsof -i :50052`
2. 프로세스 종료 또는 다른 포트 사용: `GRPC_PORT=50053`

### 마이그레이션 실패

```
ERROR: relation "quiz.questions" already exists
```

**해결 방법**:
1. 스키마 삭제 후 재생성: `DROP SCHEMA quiz CASCADE;`
2. 마이그레이션 재실행

## 개발 가이드

### 새로운 질문 타입 추가

1. `proto/quiz.proto`에 새로운 QuestionType 추가
2. Protocol Buffer 코드 재생성
3. `internal/repository/models.go`에 필드 추가
4. `internal/service/validator.go`에 검증 로직 추가
5. 마이그레이션 스크립트 작성
6. 테스트 작성

### 코드 스타일

- Go 표준 포맷팅 사용: `go fmt ./...`
- Linter 실행: `golangci-lint run`
- 테스트 커버리지 80% 이상 유지

### 커밋 메시지 규칙

```
<type>(<scope>): <subject>

<body>

<footer>
```

**타입**:
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `test`: 테스트 추가/수정
- `refactor`: 리팩토링

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

## 기여

기여는 언제나 환영합니다! Pull Request를 제출하기 전에 다음을 확인해주세요:

1. 모든 테스트가 통과하는지 확인
2. 코드 포맷팅 적용
3. 새로운 기능에 대한 테스트 작성
4. 문서 업데이트

## 연락처

문의사항이 있으시면 이슈를 생성해주세요.
