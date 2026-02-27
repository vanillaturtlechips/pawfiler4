# 요구사항 문서

## 소개

퀴즈 백엔드 서비스는 딥페이크 탐지 교육을 위한 퀴즈 시스템을 제공하는 gRPC 기반 마이크로서비스입니다. 4가지 질문 타입(객관식, OX, 영역선택, 비교)을 지원하며, 사용자 통계 추적, 정답 검증 기능을 제공합니다.

## 용어 정의

- **Quiz_Service**: 퀴즈 관련 비즈니스 로직을 처리하는 gRPC 서비스
- **Question**: 사용자에게 제시되는 퀴즈 문제 (4가지 타입 중 하나)
- **Answer_Validator**: 사용자가 제출한 답변의 정답 여부를 검증하는 컴포넌트
- **Stats_Tracker**: 사용자의 퀴즈 통계(정답률, 연속 정답 등)를 추적하는 컴포넌트

- **Database**: PostgreSQL 데이터베이스
- **Proto_Generator**: Protocol Buffer 정의 파일로부터 Go 코드를 생성하는 도구
- **Multiple_Choice_Question**: 여러 선택지 중 하나를 선택하는 질문 타입
- **True_False_Question**: 참/거짓을 선택하는 질문 타입
- **Region_Select_Question**: 이미지/비디오에서 특정 영역을 선택하는 질문 타입
- **Comparison_Question**: 두 미디어를 비교하여 하나를 선택하는 질문 타입
- **User_Stats**: 사용자의 퀴즈 통계 정보 (총 답변 수, 정답률, 연속 정답, 최고 연속 정답, 생명)
- **Tolerance**: Region_Select_Question에서 정답 영역의 허용 오차 (픽셀 단위)
- **Streak**: 연속으로 정답을 맞춘 횟수
- **Lives**: 사용자가 가진 생명 개수 (오답 시 감소)

## 요구사항

### 요구사항 1: Protocol Buffer 코드 생성

**사용자 스토리:** 개발자로서, proto 파일로부터 Go 코드를 생성하여 타입 안전성을 보장하고 싶습니다.

#### 인수 기준

1. THE Proto_Generator SHALL 읽어들인 quiz.proto 파일로부터 Go 코드를 생성한다
2. THE Proto_Generator SHALL 생성된 코드를 backend/services/quiz/pb 디렉토리에 저장한다
3. THE 생성된 코드 SHALL QuizService의 모든 RPC 메서드 인터페이스를 포함한다
4. THE 생성된 코드 SHALL 4가지 QuestionType 열거형을 포함한다

### 요구사항 2: 데이터베이스 스키마 설계

**사용자 스토리:** 개발자로서, 4가지 질문 타입을 모두 저장할 수 있는 데이터베이스 스키마가 필요합니다.

#### 인수 기준

1. THE Database SHALL quiz.questions 테이블을 생성하여 질문 데이터를 저장한다
2. THE quiz.questions 테이블 SHALL id, type, media_type, media_url, thumbnail_emoji, difficulty, category, explanation 컬럼을 포함한다
3. THE quiz.questions 테이블 SHALL Multiple_Choice_Question을 위한 options(배열), correct_index 컬럼을 포함한다
4. THE quiz.questions 테이블 SHALL True_False_Question을 위한 correct_answer(boolean) 컬럼을 포함한다
5. THE quiz.questions 테이블 SHALL Region_Select_Question을 위한 correct_regions(JSONB), tolerance 컬럼을 포함한다
6. THE quiz.questions 테이블 SHALL Comparison_Question을 위한 comparison_media_url, correct_side 컬럼을 포함한다
7. THE Database SHALL quiz.user_answers 테이블을 생성하여 사용자 답변 이력을 저장한다
8. THE quiz.user_answers 테이블 SHALL user_id, question_id, answer_data(JSONB), is_correct, xp_earned, coins_earned, answered_at 컬럼을 포함한다
9. THE Database SHALL quiz.user_stats 테이블을 생성하여 사용자 통계를 저장한다
10. THE quiz.user_stats 테이블 SHALL user_id, total_answered, correct_count, current_streak, best_streak, lives 컬럼을 포함한다

### 요구사항 3: 랜덤 질문 조회

**사용자 스토리:** 사용자로서, 랜덤한 퀴즈 질문을 받아 풀고 싶습니다.

#### 인수 기준

1. WHEN GetRandomQuestion RPC가 호출되면, THE Quiz_Service SHALL Database로부터 랜덤한 질문 하나를 조회한다
2. WHERE difficulty 파라미터가 제공되면, THE Quiz_Service SHALL 해당 난이도의 질문만 조회한다
3. WHERE type 파라미터가 제공되면, THE Quiz_Service SHALL 해당 타입의 질문만 조회한다
4. THE Quiz_Service SHALL 조회된 질문을 QuizQuestion 메시지로 반환한다
5. WHEN 질문 타입이 Multiple_Choice_Question이면, THE Quiz_Service SHALL options와 correct_index를 포함하되 correct_index는 클라이언트에 반환하지 않는다
6. WHEN 질문 타입이 True_False_Question이면, THE Quiz_Service SHALL correct_answer를 포함하되 클라이언트에 반환하지 않는다
7. WHEN 질문 타입이 Region_Select_Question이면, THE Quiz_Service SHALL correct_regions와 tolerance를 포함하되 correct_regions는 클라이언트에 반환하지 않는다
8. WHEN 질문 타입이 Comparison_Question이면, THE Quiz_Service SHALL comparison_media_url과 correct_side를 포함하되 correct_side는 클라이언트에 반환하지 않는다

### 요구사항 4: ID로 질문 조회

**사용자 스토리:** 개발자로서, 특정 질문을 ID로 조회하여 디버깅하거나 재시도할 수 있어야 합니다.

#### 인수 기준

1. WHEN GetQuestionById RPC가 호출되면, THE Quiz_Service SHALL 제공된 question_id로 Database에서 질문을 조회한다
2. WHEN 질문이 존재하면, THE Quiz_Service SHALL 해당 질문을 QuizQuestion 메시지로 반환한다
3. WHEN 질문이 존재하지 않으면, THE Quiz_Service SHALL NOT_FOUND 에러를 반환한다
4. THE Quiz_Service SHALL 정답 정보를 클라이언트에 반환하지 않는다

### 요구사항 5: 객관식 답변 검증

**사용자 스토리:** 사용자로서, 객관식 질문에 답변을 제출하고 정답 여부를 확인하고 싶습니다.

#### 인수 기준

1. WHEN Multiple_Choice_Question에 대한 SubmitAnswer RPC가 호출되면, THE Answer_Validator SHALL selected_index를 검증한다
2. WHEN selected_index가 correct_index와 일치하면, THE Answer_Validator SHALL 답변을 정답으로 판정한다
3. WHEN selected_index가 correct_index와 일치하지 않으면, THE Answer_Validator SHALL 답변을 오답으로 판정한다
4. WHEN selected_index가 options 배열의 범위를 벗어나면, THE Answer_Validator SHALL INVALID_ARGUMENT 에러를 반환한다

### 요구사항 6: OX 답변 검증

**사용자 스토리:** 사용자로서, OX 질문에 답변을 제출하고 정답 여부를 확인하고 싶습니다.

#### 인수 기준

1. WHEN True_False_Question에 대한 SubmitAnswer RPC가 호출되면, THE Answer_Validator SHALL selected_answer를 검증한다
2. WHEN selected_answer가 correct_answer와 일치하면, THE Answer_Validator SHALL 답변을 정답으로 판정한다
3. WHEN selected_answer가 correct_answer와 일치하지 않으면, THE Answer_Validator SHALL 답변을 오답으로 판정한다

### 요구사항 7: 영역선택 답변 검증

**사용자 스토리:** 사용자로서, 영역선택 질문에서 특정 좌표를 선택하고 정답 여부를 확인하고 싶습니다.

#### 인수 기준

1. WHEN Region_Select_Question에 대한 SubmitAnswer RPC가 호출되면, THE Answer_Validator SHALL selected_region(Point)을 검증한다
2. FOR EACH correct_region IN correct_regions, THE Answer_Validator SHALL selected_region과 correct_region 중심점 간의 거리를 계산한다
3. WHEN 계산된 거리가 (correct_region.radius + tolerance) 이하이면, THE Answer_Validator SHALL 답변을 정답으로 판정한다
4. WHEN 모든 correct_regions에 대해 거리가 (correct_region.radius + tolerance)를 초과하면, THE Answer_Validator SHALL 답변을 오답으로 판정한다
5. THE Answer_Validator SHALL 유클리드 거리 공식을 사용하여 거리를 계산한다

### 요구사항 8: 비교 답변 검증

**사용자 스토리:** 사용자로서, 비교 질문에서 좌측 또는 우측을 선택하고 정답 여부를 확인하고 싶습니다.

#### 인수 기준

1. WHEN Comparison_Question에 대한 SubmitAnswer RPC가 호출되면, THE Answer_Validator SHALL selected_side를 검증한다
2. WHEN selected_side가 correct_side와 일치하면, THE Answer_Validator SHALL 답변을 정답으로 판정한다
3. WHEN selected_side가 correct_side와 일치하지 않으면, THE Answer_Validator SHALL 답변을 오답으로 판정한다
4. WHEN selected_side가 "left" 또는 "right"가 아니면, THE Answer_Validator SHALL INVALID_ARGUMENT 에러를 반환한다

### 요구사항 9: 답변 저장

**사용자 스토리:** 개발자로서, 사용자의 답변 이력을 저장하여 분석할 수 있어야 합니다.

#### 인수 기준

1. WHEN 답변이 검증되면, THE Quiz_Service SHALL user_id, question_id, answer_data, is_correct를 quiz.user_answers 테이블에 저장한다
2. THE Quiz_Service SHALL answer_data를 JSONB 형식으로 저장하여 모든 질문 타입의 답변을 지원한다
3. WHEN 정답이면, THE Quiz_Service SHALL xp_earned와 coins_earned를 계산하여 저장한다
4. THE Quiz_Service SHALL answered_at 컬럼에 현재 시각을 저장한다

### 요구사항 10: 보상 계산

**사용자 스토리:** 사용자로서, 정답을 맞추면 경험치와 코인을 획득하고 싶습니다.

#### 인수 기준

1. WHEN 답변이 정답이면, THE Quiz_Service SHALL 10 XP를 부여한다
2. WHEN 답변이 정답이면, THE Quiz_Service SHALL 5 코인을 부여한다
3. WHEN 답변이 오답이면, THE Quiz_Service SHALL 0 XP와 0 코인을 부여한다
4. THE Quiz_Service SHALL 계산된 xp_earned와 coins_earned를 SubmitAnswerResponse에 포함한다

### 요구사항 11: 사용자 통계 업데이트

**사용자 스토리:** 사용자로서, 내 퀴즈 통계가 실시간으로 업데이트되기를 원합니다.

#### 인수 기준

1. WHEN 답변이 제출되면, THE Stats_Tracker SHALL quiz.user_stats 테이블의 total_answered를 1 증가시킨다
2. WHEN 답변이 정답이면, THE Stats_Tracker SHALL correct_count를 1 증가시킨다
3. WHEN 답변이 정답이면, THE Stats_Tracker SHALL current_streak를 1 증가시킨다
4. WHEN 답변이 오답이면, THE Stats_Tracker SHALL current_streak를 0으로 초기화한다
5. WHEN 답변이 오답이면, THE Stats_Tracker SHALL lives를 1 감소시킨다
6. WHEN current_streak가 best_streak보다 크면, THE Stats_Tracker SHALL best_streak를 current_streak 값으로 업데이트한다
7. THE Stats_Tracker SHALL correct_rate를 (correct_count / total_answered)로 계산한다
8. THE Stats_Tracker SHALL 업데이트된 통계를 트랜잭션으로 처리하여 데이터 일관성을 보장한다

### 요구사항 12: 사용자 통계 조회

**사용자 스토리:** 사용자로서, 내 퀴즈 통계를 조회하여 진행 상황을 확인하고 싶습니다.

#### 인수 기준

1. WHEN GetUserStats RPC가 호출되면, THE Quiz_Service SHALL 제공된 user_id로 quiz.user_stats 테이블을 조회한다
2. WHEN 사용자 통계가 존재하면, THE Quiz_Service SHALL QuizStats 메시지로 반환한다
3. WHEN 사용자 통계가 존재하지 않으면, THE Quiz_Service SHALL 기본값(total_answered=0, correct_rate=0, current_streak=0, best_streak=0, lives=3)을 반환한다
4. THE Quiz_Service SHALL correct_rate를 백분율이 아닌 0~1 사이의 소수로 반환한다

### 요구사항 13: gRPC 서버 초기화

**사용자 스토리:** 개발자로서, gRPC 서버가 올바르게 초기화되고 실행되어야 합니다.

#### 인수 기준

1. WHEN 서비스가 시작되면, THE Quiz_Service SHALL PostgreSQL 데이터베이스에 연결한다
2. WHEN 서비스가 시작되면, THE Quiz_Service SHALL 포트 50052에서 gRPC 서버를 시작한다
3. WHEN 데이터베이스 연결이 실패하면, THE Quiz_Service SHALL 에러를 로깅하고 종료한다
4. THE Quiz_Service SHALL 환경 변수로부터 데이터베이스 연결 정보를 읽어들인다

### 요구사항 14: 에러 처리

**사용자 스토리:** 개발자로서, 명확한 에러 메시지를 통해 문제를 빠르게 파악하고 싶습니다.

#### 인수 기준

1. WHEN 질문을 찾을 수 없으면, THE Quiz_Service SHALL NOT_FOUND 상태 코드와 설명 메시지를 반환한다
2. WHEN 잘못된 파라미터가 제공되면, THE Quiz_Service SHALL INVALID_ARGUMENT 상태 코드와 설명 메시지를 반환한다
3. WHEN 데이터베이스 에러가 발생하면, THE Quiz_Service SHALL INTERNAL 상태 코드와 설명 메시지를 반환한다
4. THE Quiz_Service SHALL 모든 에러를 로깅하여 디버깅을 지원한다
5. THE Quiz_Service SHALL 클라이언트에 민감한 정보(스택 트레이스, 데이터베이스 상세 등)를 노출하지 않는다

### 요구사항 15: 데이터베이스 마이그레이션

**사용자 스토리:** 개발자로서, 데이터베이스 스키마를 버전 관리하고 자동으로 적용하고 싶습니다.

#### 인수 기준

1. THE Quiz_Service SHALL 데이터베이스 마이그레이션 스크립트를 제공한다
2. THE 마이그레이션 스크립트 SHALL quiz 스키마를 생성한다
3. THE 마이그레이션 스크립트 SHALL 요구사항 2에 정의된 모든 테이블을 생성한다
4. THE 마이그레이션 스크립트 SHALL 적절한 인덱스를 생성하여 쿼리 성능을 최적화한다
5. THE 마이그레이션 스크립트 SHALL 외래 키 제약조건을 설정하여 데이터 무결성을 보장한다

### 요구사항 16: Docker 컨테이너화

**사용자 스토리:** 개발자로서, 서비스를 Docker 컨테이너로 실행하여 배포를 간소화하고 싶습니다.

#### 인수 기준

1. THE Quiz_Service SHALL Dockerfile을 제공하여 컨테이너 이미지를 빌드한다
2. THE Dockerfile SHALL 멀티스테이지 빌드를 사용하여 이미지 크기를 최소화한다
3. THE Quiz_Service SHALL docker-compose.yml에 정의되어 다른 서비스와 함께 실행된다
4. THE docker-compose.yml SHALL PostgreSQL과 Quiz_Service 간의 네트워크를 구성한다
5. THE Quiz_Service SHALL 컨테이너 시작 시 데이터베이스 연결을 대기하는 헬스체크를 수행한다
