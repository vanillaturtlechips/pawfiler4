# Pawfiler Admin Frontend

관리자 전용 프론트엔드 애플리케이션

## 기능

- 퀴즈 문제 관리 (CRUD)
- 미디어 파일 업로드 (S3)
- 커뮤니티 관리 (예정)

## 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (포트 5175)
npm run dev

# 빌드
npm run build
```

## 환경 변수

`.env` 파일:
```
VITE_ADMIN_API_URL=http://localhost:8082
```

## 배포

- 별도 S3 버킷 + CloudFront
- 도메인: `admin.pawfiler.com`
- Kubernetes Namespace: `pawfiler-admin`

## 기술 스택

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Radix UI
- React Router
