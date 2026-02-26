# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)


## Environment Configuration

### Backend Setup (PostgreSQL + Services)

**상세 가이드**: [BACKEND_SETUP.md](./BACKEND_SETUP.md) 참고

간단 실행:
```bash
cd backend
chmod +x start-backend.sh
./start-backend.sh
```

또는 수동 실행:
```bash
cd backend
docker-compose up -d
```

서비스:
- PostgreSQL: `localhost:5432`
- Quiz API: `http://localhost:3001/api/quiz`
- Community API: `http://localhost:50053`

### Development
Copy `.env.example` to `.env.development` and configure:

```bash
cp .env.example .env.development
```

### Production (Cloud Deployment)
Create `.env.production` with your cloud endpoints:

```env
# Production API Endpoints
VITE_API_BASE_URL=https://api.pawfiler.com
VITE_QUIZ_API_URL=https://api.pawfiler.com/quiz
VITE_COMMUNITY_API_URL=https://api.pawfiler.com/community
VITE_VIDEO_ANALYSIS_API_URL=https://api.pawfiler.com/video-analysis
VITE_PAYMENT_API_URL=https://api.pawfiler.com/payment

# Disable Mock APIs in production
VITE_USE_MOCK_API=false
VITE_USE_MOCK_AUTH=false

VITE_APP_NAME=PawFiler
VITE_TUTORIAL_STORAGE_KEY=pawfiler_tutorial_seen
```

### Build for Production

```bash
# Build with production environment
npm run build

# Preview production build
npm run preview
```

## Cloud Deployment Guide

### AWS Deployment
1. **Frontend (S3 + CloudFront)**
   - Build: `npm run build`
   - Upload `dist/` to S3 bucket
   - Configure CloudFront distribution
   - Set environment variables in build process

2. **Backend Services (ECS/EKS)**
   - Deploy microservices using Docker Compose or Kubernetes
   - Configure API Gateway for routing
   - Set up Load Balancer

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Variables in Vercel
Add in Project Settings → Environment Variables:
- `VITE_API_BASE_URL`
- `VITE_QUIZ_API_URL`
- `VITE_COMMUNITY_API_URL`
- `VITE_VIDEO_ANALYSIS_API_URL`
- `VITE_PAYMENT_API_URL`
- `VITE_USE_MOCK_API=false`
- `VITE_USE_MOCK_AUTH=false`

## Features

### Quiz Game
- 10 questions per game
- 4 question types: Multiple Choice, True/False, Region Select, Comparison
- Real-time scoring and statistics
- Celebration animation on completion

### Community
- Infinite scroll pagination
- Create, Read, Update, Delete posts
- Search functionality
- Tag system

### Video Analysis
- Deepfake detection simulation
- Real-time analysis logs
- Detailed report with confidence scores

### Shop
- Subscription plans
- Mock payment integration
- Premium features

## API Integration

The app supports both Mock API (development) and Real API (production) modes.

### Mock Mode (Default)
- Set `VITE_USE_MOCK_API=true`
- No backend required
- Perfect for frontend development
- Data stored in memory (resets on refresh)

### Real API Mode (PostgreSQL)
- Set `VITE_USE_MOCK_API=false`
- Requires backend services running (see [BACKEND_SETUP.md](./BACKEND_SETUP.md))
- Data persisted in PostgreSQL database
- Full CRUD operations available

### Backend Architecture
- **Quiz Service**: Go + gRPC + PostgreSQL
- **Quiz Proxy**: Node.js (gRPC → REST conversion)
- **Community Service**: Go + HTTP + PostgreSQL (메모리 사용 중)
- **No Kafka**: 단순한 직접 DB 연결 방식

## Troubleshooting

### Backend Services
백엔드 관련 문제는 [BACKEND_SETUP.md](./BACKEND_SETUP.md)의 트러블슈팅 섹션 참고

### CORS Errors
If you see CORS errors in console:
1. Ensure backend services have CORS enabled
2. Check API URLs in `.env` file
3. Verify network connectivity
4. Try Mock mode: `VITE_USE_MOCK_API=true`

### Quiz Connection Refused
If quiz API fails to connect:
1. Check if backend is running: `cd backend && docker-compose ps`
2. Start backend: `cd backend && ./start-backend.sh`
3. Verify `VITE_QUIZ_API_URL` in `.env`
4. Enable Mock mode: `VITE_USE_MOCK_API=true`

### Community Posts Not Loading
1. Check `VITE_COMMUNITY_API_URL` configuration
2. Verify Community Service is running: `docker-compose logs community-service`
3. Enable Mock mode for development
2. Enable Mock mode for development
3. Verify backend service is running on correct port
