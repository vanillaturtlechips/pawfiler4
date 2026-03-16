# 퀴즈 게임 강화 시스템 가이드

## 📋 개요
PawFiler 퀴즈 게임에 에너지 시스템, 25레벨 티어 진행, 난이도별 보상, XP 이월 시스템을 구현했습니다.

## 🎮 핵심 기능

### 1. 에너지 시스템
- **최대 에너지**: 100
- **문제당 소모**: 5 에너지
  - 5문제 = 25 에너지
  - 10문제 = 40 에너지 (8 에너지/문제)
- **자동 충전**: 3시간마다 +10 에너지
- **수동 충전**: 🦊 이모지 더블클릭 (Header 로고)
- **에너지 부족 시**: 자동으로 상점 페이지로 이동

**구현 위치**:
- Backend: `quiz_service.go` - GetRandomQuestion에서 에너지 차감
- Frontend: `GamePage.tsx` - 429 에러 처리
- API: `/quiz.QuizService/RefillEnergy` - 에너지 충전 엔드포인트

### 2. 25레벨 티어 시스템

#### 티어 구조 (각 티어당 5레벨)
```
알 (Lv.1-5)      : 0-10 XP
  - Lv.1: 0-2 XP
  - Lv.2: 2-4 XP
  - Lv.3: 4-6 XP
  - Lv.4: 6-8 XP
  - Lv.5: 8-10 XP

삐약이 (Lv.1-5)  : 0-100 XP
  - Lv.1: 0-20 XP
  - Lv.2: 20-40 XP
  - Lv.3: 40-60 XP
  - Lv.4: 60-80 XP
  - Lv.5: 80-100 XP

맹금닭 (Lv.1-5)  : 0-1000 XP
  - Lv.1: 0-200 XP
  - Lv.2: 200-400 XP
  - Lv.3: 400-600 XP
  - Lv.4: 600-800 XP
  - Lv.5: 800-1000 XP

불사조 (Lv.1-5)  : 0-2500 XP
  - Lv.1: 0-500 XP
  - Lv.2: 500-1000 XP
  - Lv.3: 1000-1500 XP
  - Lv.4: 1500-2000 XP
  - Lv.5: 2000+ XP
```

#### 티어 이모지 매핑
- 🥚 알
- 🐥 삐약이
- 🐓 맹금닭
- 🦅 불사조

**구현 위치**:
- Backend: `models.go` - Level(), Tier(), TierName() 함수
- DB: `current_tier` 컬럼 추가 (VARCHAR(20), DEFAULT '알')
- Frontend: `Header.tsx` - 티어 이모지 표시

### 3. XP 이월 시스템

#### 레벨업 시 XP 이월
예시: 알 Lv.1 (1 XP) + 3 XP 획득
1. 총 4 XP
2. Lv.2 임계값(2 XP) 도달 → 2 XP 차감
3. 남은 2 XP로 Lv.3 도달
4. 최종: 알 Lv.3 (0 XP)

#### 티어 승급 시 XP 이월
예시: 알 Lv.5 (9 XP) + 3 XP 획득
1. 총 12 XP
2. 티어 경계(10 XP) 도달 → 10 XP 차감
3. 남은 2 XP 이월
4. 최종: 삐약이 Lv.1 (2 XP)

**구현 위치**:
- Backend: `quiz_service.go` - SubmitAnswer의 Step 5b
- 로직: for 루프로 연속 레벨업 처리

### 4. 난이도별 보상 (10배 증가)

| 난이도 | XP | 코인 |
|--------|-----|------|
| 쉬움   | 10  | 50   |
| 보통   | 25  | 120  |
| 어려움 | 50  | 250  |

**구현 위치**:
- Backend: `models.go` - XPRewardByDifficulty() 함수

### 5. 난이도 필터링
- SelectScreen에서 난이도 선택
- API 요청 시 difficulty 파라미터 전달
- 백엔드에서 해당 난이도 문제만 반환

**구현 위치**:
- Frontend: `SelectScreen.tsx` - difficulty state
- API: `api.ts` - fetchQuizQuestion(difficulty)
- Backend: `quiz_service.go` - GetRandomQuestion

## 🗄️ 데이터베이스 스키마

### user_profiles 테이블
```sql
CREATE TABLE quiz.user_profiles (
  user_id UUID PRIMARY KEY,
  total_exp INT DEFAULT 0,
  total_coins INT DEFAULT 0,
  current_tier VARCHAR(20) DEFAULT '알',  -- 새로 추가
  energy INT DEFAULT 100,
  max_energy INT DEFAULT 100,
  last_energy_refill TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 마이그레이션
```sql
ALTER TABLE quiz.user_profiles 
ADD COLUMN IF NOT EXISTS current_tier VARCHAR(20) DEFAULT '알';

UPDATE quiz.user_profiles 
SET current_tier = '알' 
WHERE current_tier IS NULL OR current_tier = '';
```

## 📁 주요 파일 목록

### Backend
```
backend/services/quiz/internal/
├── repository/
│   ├── models.go              # UserProfile, Level(), Tier(), TierName()
│   ├── gorm_models.go         # GormUserProfile (current_tier 추가)
│   └── gorm_repository.go     # UpdateUserProfile()
├── service/
│   └── quiz_service.go        # SubmitAnswer (XP 이월 로직)
├── handler/
│   └── quiz_handler.go        # UpdateUserProfile() 추가
└── rest/
    └── handler.go             # RefillEnergy 엔드포인트
```

### Frontend
```
frontend/src/
├── pages/
│   ├── GamePage.tsx           # 에너지 체크, 429 처리
│   ├── ProfilePage.tsx        # XP 바 표시
│   └── ShopPage.tsx           # 티어/레벨 표시
├── components/
│   ├── Header.tsx             # 티어 이모지, 에너지 충전
│   └── quiz/
│       └── SelectScreen.tsx   # 난이도 선택, 에너지 표시
├── contexts/
│   └── QuizProfileContext.tsx # 전역 프로필 상태 관리
└── lib/
    ├── api.ts                 # refillEnergy(), fetchQuizQuestion()
    └── types.ts               # QuizGameProfile 인터페이스
```

## 🔧 API 엔드포인트

### 1. 에너지 충전
```
POST /quiz.QuizService/RefillEnergy
Body: { "user_id": "uuid" }
Response: { "success": true, "energy": 100 }
```

### 2. 문제 가져오기 (에너지 차감)
```
POST /quiz.QuizService/GetRandomQuestion
Body: { 
  "user_id": "uuid",
  "difficulty": "easy" | "medium" | "hard"
}
Response: QuizQuestion | 429 { "error": "insufficient_energy", "energy": 0 }
```

### 3. 답안 제출 (XP/코인 획득)
```
POST /quiz.QuizService/SubmitAnswer
Body: { "user_id": "uuid", "question_id": "uuid", "answer": {...} }
Response: { 
  "is_correct": true,
  "xp_earned": 25,
  "coins_earned": 120,
  "explanation": "..."
}
```

### 4. 프로필 조회
```
POST /quiz.QuizService/GetUserProfile
Body: { "user_id": "uuid" }
Response: {
  "user_id": "uuid",
  "total_exp": 150,
  "total_coins": 500,
  "current_tier": "삐약이",
  "level": 3,
  "tier_name": "삐약이 Lv.3",
  "energy": 85,
  "max_energy": 100
}
```

## 🎯 테스트 시나리오

### 1. 에너지 시스템
```bash
# 에너지 0으로 설정
docker exec pawfiler-postgres psql -U pawfiler -d pawfiler -c \
  "UPDATE quiz.user_profiles SET energy = 0 WHERE user_id = 'YOUR_UUID';"

# 문제 요청 → 429 에러 확인
# 상점으로 자동 이동 확인
# 🦊 더블클릭 → 에너지 100 충전 확인
```

### 2. XP 이월
```bash
# 알 Lv.5 (9 XP)로 설정
docker exec pawfiler-postgres psql -U pawfiler -d pawfiler -c \
  "UPDATE quiz.user_profiles SET total_exp = 9, current_tier = '알' WHERE user_id = 'YOUR_UUID';"

# 어려움 문제 정답 (50 XP) → 삐약이 Lv.5 (49 XP) 확인
```

### 3. 연속 레벨업
```bash
# 알 Lv.1 (0 XP)로 설정
docker exec pawfiler-postgres psql -U pawfiler -d pawfiler -c \
  "UPDATE quiz.user_profiles SET total_exp = 0, current_tier = '알' WHERE user_id = 'YOUR_UUID';"

# 어려움 문제 정답 (50 XP) → 삐약이 Lv.5 (40 XP) 확인
```

## 🚀 배포 체크리스트

### Backend
- [ ] DB 마이그레이션 실행 (current_tier 컬럼 추가)
- [ ] quiz-service 재빌드 및 배포
- [ ] 기존 유저 current_tier 초기화 확인

### Frontend
- [ ] QuizProfileContext 전역 적용 확인
- [ ] 모든 페이지에서 quizProfile 사용 확인
- [ ] 에너지 충전 API 연동 확인

### 테스트
- [ ] 에너지 소모 및 충전 동작
- [ ] 난이도별 보상 지급
- [ ] XP 이월 (레벨업/티어 승급)
- [ ] 티어 이모지 표시
- [ ] 에너지 부족 시 상점 이동

## 📝 Git 브랜치
```bash
# 작업 브랜치
git checkout hansik-quiz-enhancement

# 최신 변경사항 가져오기
git pull origin hansik-quiz-enhancement

# 메인 브랜치에 머지 (리뷰 후)
git checkout main
git merge hansik-quiz-enhancement
git push origin main
```

## 🤝 팀원 적용 가이드

### AI 에이전트 사용 시
1. 이 문서를 AI에게 제공
2. 구현하려는 기능 설명
3. AI가 이 시스템에 맞게 코드 생성

### 예시 프롬프트
```
"QUIZ_ENHANCEMENT_GUIDE.md를 읽고, 
상점에서 코인으로 에너지 구매 기능을 추가해줘.
- 에너지 10개 = 50 코인
- 구매 시 즉시 에너지 충전
- 코인 차감 및 DB 업데이트"
```

## 🐛 알려진 이슈
- 없음 (현재 안정적으로 동작)

## 📞 문의
- 작성자: hansik
- 브랜치: hansik-quiz-enhancement
- 마지막 업데이트: 2026-03-13
