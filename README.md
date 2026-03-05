# PawFiler Project

## 프로젝트 구조

```
pawfiler4/
├── frontend/          # 메인 사용자 프론트엔드 (React)
├── admin-frontend/    # 관리자 프론트엔드 (React)
├── backend/           # 백엔드 마이크로서비스
│   ├── services/
│   │   ├── quiz/           # 퀴즈 서비스 (Go)
│   │   ├── community/      # 커뮤니티 서비스 (Go)
│   │   ├── admin/          # 관리자 서비스 (Go)
│   │   └── video-analysis/ # 영상 분석 서비스 (Python)
│   ├── quiz-proxy/    # Quiz gRPC → REST 프록시 (Node.js)
│   └── envoy/         # API Gateway
└── terraform/         # AWS 인프라 (EKS, RDS, ECR)
```

## 빠른 시작

### Frontend 개발
```bash
cd frontend
npm install
npm run dev
```

### Admin Frontend 개발
```bash
cd admin-frontend
npm install
npm run dev
```

### Backend 개발
```bash
cd backend
docker-compose up
```

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
