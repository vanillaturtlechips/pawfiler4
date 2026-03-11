# Quiz Service

딥페이크 탐지 퀴즈 서비스 - 사용자가 AI 생성 이미지/영상을 식별하는 게임형 학습 플랫폼

## 현재 구현 상태 (2024-01-XX)

### ✅ 완료된 기능

#### 1. 퀴즈 문제 유형 (4가지)
- **객관식 (Multiple Choice)**: 4개 선택지 중 정답 선택
- **OX 퀴즈 (True/False)**: 진짜/가짜 판별
- **틀린 부분 찾기 (Region Select)**: 이미지에서 조작된 영역 클릭
- **가짜 비교하기 (Comparison)**: 두 이미지 중 AI 생성 이미지 선택

#### 2. 문제 카테고리
- `ai-generated-detection`: AI 생성 이미지 탐지 (텍스트 왜곡, 그림자 부자연스러움 등)
- `video-synthesis-detection`: 영상 합성 탐지 (고양이 합성 영상 등)

#### 3. 난이도 시스템
- **Easy (Lv.1 쉬움)**: 명확한 특징
- **Medium (Lv.2 보통)**: 중간 난이도
- **Hard (Lv.3 어려움)**: 미묘한 차이 (그림자, 깃털 구조 등)

#### 4. 미디어 저장소
- **S3 버킷**: `pawfiler-quiz-media`
- **CloudFront**: CDN을 통한 빠른 미디어 전송
- **현재 구조**:
  ```
  images/
    deepfake/
      deepfake_easy_001.jpg
      compare_left_001.jpg
    real/
      compare_right_001.jpg
  videos/
    deepfake/
      deepfake_easy_001.mp4
  ```

#### 5. 프론트엔드 기능
- 객관식 정답/오답 표시 (정답: 초록색, 오답: 빨간색 + 정답 표시)
- 비교 문제 이미지 무작위 배치 (왼쪽/오른쪽 랜덤)
- 카테고리 및 난이도 표시
- 세션 통계 (정답률, 연속 정답 등)

#### 6. 백엔드 구조
- **언어**: Go
- **프레임워크**: gRPC
- **데이터베이스**: PostgreSQL
- **프록시**: Node.js (gRPC-Web to gRPC)

### 📝 샘플 데이터

#### 이미지 문제
1. **AI 생성 이미지 - 텍스트 왜곡** (easy)
   - 오른쪽 위 보드의 글씨가 깨지고 왜곡됨
   - 파일: `deepfake_easy_001.jpg`

2. **AI 생성 이미지 - 그림자 부자연스러움** (hard)
   - 올빼미 날개 그림자가 단순화되어 있음
   - 발톱 개수/모양 불분명, 깃털 구조 부자연스러움
   - 파일: `compare_left_001.jpg` (AI), `compare_right_001.jpg` (진짜)

#### 영상 문제
1. **영상 합성 - 고양이 파티** (easy)
   - 파티 장면에 고양이 합성
   - 책상에 떨어질 때 효과 부자연스러움
   - 불빛 반사 이상, 손 동작 어색함
   - 파일: `deepfake_easy_001.mp4`

### 🔄 다음 단계 (TODO)

#### 1. S3 파일명 규칙 변경
**현재**:
```
images/deepfake/deepfake_easy_001.jpg
```

**변경 예정**:
```
{category}/{media_type}/{difficulty}/{uuid}.{ext}

예시:
ai-generated-detection/image/easy/550e8400-e29b-41d4-a716-446655440001.jpg
ai-generated-detection/image/hard/550e8400-e29b-41d4-a716-446655440008.jpg
video-synthesis-detection/video/easy/550e8400-e29b-41d4-a716-446655440002.mp4
```

**장점**:
- UUID 기반으로 파일명 충돌 없음
- DB question ID와 매칭 가능
- 자동 업로드 로직 구현 용이
- 보안 강화 (파일 내용 추측 불가)

#### 2. 관리자 미디어 업로드 기능
- 관리자 페이지에서 이미지/영상 직접 업로드
- S3 업로드 API 구현
- 문제 생성 시 미디어 자동 연결

## 기술 스택

### Backend
- **Language**: Go 1.21+
- **Framework**: gRPC
- **Database**: PostgreSQL 15
- **ORM**: database/sql (native)
- **Proxy**: Node.js + Express (gRPC-Web)

### Frontend
- **Framework**: React + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Animation**: Framer Motion
- **State**: React Hooks

### Infrastructure
- **Storage**: AWS S3
- **CDN**: AWS CloudFront
- **Container**: Docker + Docker Compose

## 로컬 개발 환경

### 1. 데이터베이스 초기화
```bash
cd backend
docker-compose up -d postgres
docker exec -i pawfiler-postgres psql -U pawfiler -d pawfiler < services/quiz/migrations/001_create_schema.sql
docker exec -i pawfiler-postgres psql -U pawfiler -d pawfiler < services/quiz/migrations/002_insert_sample_data.sql
```

### 2. 백엔드 실행
```bash
cd backend
docker-compose up quiz-service quiz-proxy
```

### 3. 프론트엔드 실행
```bash
npm run dev
```

### 4. 접속
- Frontend: http://localhost:5176
- Quiz Proxy: http://localhost:8081
- Quiz Service (gRPC): localhost:50051

## API 엔드포인트

### Quiz Service (gRPC via HTTP Proxy)

#### GET /random
랜덤 퀴즈 문제 가져오기
```json
POST http://localhost:8081/random
{
  "user_id": "uuid"
}
```

#### POST /submit
답안 제출
```json
POST http://localhost:8081/submit
{
  "user_id": "uuid",
  "question_id": "uuid",
  "selected_index": 1,  // 객관식
  "selected_answer": true,  // OX
  "selected_region": {"x": 100, "y": 200},  // 틀린부분찾기
  "selected_side": "left"  // 비교하기
}
```

#### POST /stats
사용자 통계 조회
```json
POST http://localhost:8081/stats
{
  "user_id": "uuid"
}
```

## 데이터베이스 스키마

### questions 테이블
```sql
- id: UUID (PK)
- type: ENUM (multiple_choice, true_false, region_select, comparison)
- media_type: ENUM (image, video)
- media_url: TEXT
- thumbnail_emoji: TEXT
- difficulty: ENUM (easy, medium, hard)
- category: TEXT
- explanation: TEXT
- options: TEXT[] (객관식)
- correct_index: INT (객관식)
- correct_answer: BOOLEAN (OX)
- correct_regions: JSONB (틀린부분찾기)
- tolerance: INT (틀린부분찾기)
- comparison_media_url: TEXT (비교하기)
- correct_side: TEXT (비교하기)
```

### user_stats 테이블
```sql
- user_id: UUID (PK)
- total_answered: INT
- correct_answered: INT
- current_streak: INT
- best_streak: INT
- lives: INT
- last_answer_time: TIMESTAMP
```

## 문제 추가 가이드

### 1. 미디어 업로드
```bash
# S3에 업로드
aws s3 cp your-image.jpg s3://pawfiler-quiz-media/images/deepfake/
```

### 2. DB에 문제 추가
```sql
INSERT INTO quiz.questions (id, type, media_type, media_url, ...)
VALUES ('uuid', 'multiple_choice', 'image', 'https://...', ...);
```

## 참고 문서
- [MEDIA_SETUP.md](./MEDIA_SETUP.md): S3 미디어 설정 가이드
- [Spec 문서](.kiro/specs/quiz-backend-service/): 요구사항 및 설계 문서
# CI/CD test - Wed Mar 11 04:48:13 AM KST 2026
