# PawFiler Frontend

메인 사용자 프론트엔드 애플리케이션

## 기술 스택

- React 18
- TypeScript
- Vite
- TailwindCSS
- shadcn/ui
- React Router
- TanStack Query

## 개발 서버 실행

```bash
npm install
npm run dev
```

개발 서버: http://localhost:5173

## 빌드

```bash
npm run build
```

## 주요 페이지

- `/` - 홈 (3개 문 선택)
- `/game` - 퀴즈 게임
- `/community` - 커뮤니티
- `/analysis` - 영상 분석
- `/shop` - 상점

## 환경 변수

`.env` 파일 생성:

```
VITE_API_BASE_URL=http://localhost:8080
VITE_QUIZ_API_URL=http://localhost:3001
VITE_COMMUNITY_API_URL=http://localhost:50053
```
