/**
 * Mock API Client — simulates gRPC metadata injection & network latency.
 * Every request auto-attaches the JWT token from the caller.
 */
import type {
  LoginRequest,
  SignupRequest,
  UserProfile,
  QuizQuestion,
  QuizSubmitRequest,
  QuizSubmitResponse,
  QuizStats,
  CommunityFeed,
  DeepfakeReport,
  AnalysisLogEntry,
  DashboardAggregated,
  CheckoutRequest,
  CheckoutResponse,
  SubscriptionPlan,
} from "./types";

// --------------- helpers ---------------

const delay = (min = 500, max = 1500) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)));

const fakeJwt = (payload: Record<string, unknown>) => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa("mock-signature");
  return `${header}.${body}.${sig}`;
};

const uuid = () => crypto.randomUUID();

/** Simulates attaching gRPC metadata (authorization header) */
const withAuth = (token: string | null) => {
  // Mock에서는 token 체크 완화
  return { authorization: token ? `Bearer ${token}` : "", "x-request-id": uuid() };
};

// --------------- Mock data ---------------

const MOCK_USER: UserProfile = {
  id: "usr_fox_001",
  email: "detective@deepfind.io",
  nickname: "날쌘 여우 탐정",
  avatarEmoji: "🦊",
  subscriptionType: "free",
  coins: 1200,
  level: 5,
  levelTitle: "전문가",
  xp: 3400,
  createdAt: "2025-09-15T00:00:00Z",
};

const MOCK_QUIZ_QUESTIONS: QuizQuestion[] = [
  // 1. Multiple Choice (객관식)
  {
    id: "q1",
    type: "multiple_choice",
    mediaType: "video",
    mediaUrl: "",
    thumbnailEmoji: "🎬",
    difficulty: "easy",
    category: "딥페이크 탐지",
    explanation: "딥페이크 영상에서는 눈 깜빡임이 부자연스러운 경우가 많아요!",
    options: ["입 모양이 어색해요", "눈 깜빡임이 없어요", "머리카락이 흔들려요", "목소리가 달라요"],
    correctIndex: 1,
  },
  // 2. True/False (OX 퀴즈)
  {
    id: "q2",
    type: "true_false",
    mediaType: "video",
    mediaUrl: "",
    thumbnailEmoji: "🎥",
    difficulty: "medium",
    category: "딥페이크 탐지",
    explanation: "이 영상은 AI로 생성된 가짜 영상입니다. 얼굴 경계가 부자연스럽게 번져있어요!",
    correctAnswer: false,
  },
  // 3. Region Select (영역 선택 - 이미지)
  {
    id: "q3",
    type: "region_select",
    mediaType: "image",
    mediaUrl: "https://via.placeholder.com/800x600/333/fff?text=Deepfake+Image",
    thumbnailEmoji: "🖼️",
    difficulty: "hard",
    category: "딥페이크 탐지",
    explanation: "얼굴 주변 경계 부분이 조작되었습니다!",
    correctRegions: [{ x: 400, y: 250, radius: 80 }],
    tolerance: 100,
  },
  // 4. Comparison (비교 문제 - 이미지)
  {
    id: "q4",
    type: "comparison",
    mediaType: "image",
    mediaUrl: "https://via.placeholder.com/600x800/444/fff?text=Image+A",
    comparisonMediaUrl: "https://via.placeholder.com/600x800/555/fff?text=Image+B",
    thumbnailEmoji: "🔍",
    difficulty: "medium",
    category: "딥페이크 탐지",
    explanation: "왼쪽 이미지가 진짜입니다. 오른쪽은 AI가 생성한 가짜예요!",
    correctSide: "left",
  },
  // 5. Multiple Choice (객관식 - 이미지)
  {
    id: "q5",
    type: "multiple_choice",
    mediaType: "image",
    mediaUrl: "https://via.placeholder.com/800x600/666/fff?text=Suspicious+Photo",
    thumbnailEmoji: "📸",
    difficulty: "easy",
    category: "딥페이크 탐지",
    explanation: "배경과 조명이 일치하지 않는 것이 가장 큰 단서입니다!",
    options: ["얼굴 표정이 자연스러워요", "배경과 조명이 안 맞아요", "옷이 선명해요", "머리카락이 자연스러워요"],
    correctIndex: 1,
  },
];

const MOCK_COMMUNITY_POSTS = [
  { id: "p1", authorNickname: "꼬마 탐정", authorEmoji: "🐱", title: "딥페이크 찾는 꿀팁 공유!", body: "눈 깜빡임을 잘 보세요...", likes: 42, comments: 7, createdAt: "2026-02-20T10:00:00Z", tags: ["팁", "초보"] },
  { id: "p2", authorNickname: "수리 부엉이", authorEmoji: "🦉", title: "레벨 10 달성 후기", body: "드디어 마스터 탐정이 되었어요!", likes: 128, comments: 23, createdAt: "2026-02-22T15:30:00Z", tags: ["후기", "레벨업"] },
  { id: "p3", authorNickname: "용감한 곰", authorEmoji: "🐻", title: "이 영상 진짜인가요?", body: "친구가 보내준 영상인데 좀 이상해요...", likes: 15, comments: 5, createdAt: "2026-02-24T09:00:00Z", tags: ["질문"] },
];

const MOCK_PLANS: SubscriptionPlan[] = [
  { id: "monthly", name: "월간 프리미엄", price: 4900, currency: "KRW", features: ["무제한 분석", "광고 제거", "프리미엄 뱃지", "우선 분석 큐"] },
  { id: "yearly", name: "연간 프리미엄", price: 39000, currency: "KRW", features: ["무제한 분석", "광고 제거", "프리미엄 뱃지", "우선 분석 큐", "보너스 코인 500닢"] },
];

// --------------- Auth Service ---------------

export async function mockLogin(req: LoginRequest): Promise<{ token: string; user: UserProfile }> {
  await delay(600, 1000);
  if (req.email && req.password) {
    const user = { ...MOCK_USER, email: req.email };
    const token = fakeJwt({ sub: user.id, email: user.email, nickname: user.nickname, avatarEmoji: user.avatarEmoji, role: user.subscriptionType, iat: Date.now(), exp: Date.now() + 3600000 });
    return { token, user };
  }
  throw new Error("INVALID_CREDENTIALS");
}

export async function mockSignup(req: SignupRequest): Promise<{ token: string; user: UserProfile }> {
  await delay(800, 1200);
  const user: UserProfile = { ...MOCK_USER, id: uuid(), email: req.email, nickname: req.nickname, avatarEmoji: req.avatarEmoji, coins: 100, level: 1, levelTitle: "새싹 탐정", xp: 0 };
  const token = fakeJwt({ sub: user.id, email: user.email, nickname: user.nickname, avatarEmoji: user.avatarEmoji, role: "free", iat: Date.now(), exp: Date.now() + 3600000 });
  return { token, user };
}

// --------------- Dashboard BFF ---------------

export async function fetchDashboardData(token: string): Promise<DashboardAggregated> {
  withAuth(token);
  // BFF pattern: parallel fetch from User, Quiz, Community
  const [user, quizStats, feed] = await Promise.all([
    fetchUserProfile(token),
    fetchQuizStats(token),
    fetchCommunityFeed(token),
  ]);
  await delay(200, 400); // aggregation overhead
  return {
    user,
    quizStats,
    recentPosts: feed.posts.slice(0, 3),
    dailyChallenge: { title: "가짜 영상 3번 찾기", progress: 1, total: 3, reward: 50 },
  };
}

// --------------- User Service ---------------

export async function fetchUserProfile(token: string): Promise<UserProfile> {
  withAuth(token);
  await delay(300, 600);
  return { ...MOCK_USER };
}

// --------------- Quiz Service ---------------

export async function fetchQuizQuestion(token: string): Promise<QuizQuestion> {
  withAuth(token);
  await delay(500, 800);
  return MOCK_QUIZ_QUESTIONS[Math.floor(Math.random() * MOCK_QUIZ_QUESTIONS.length)];
}

export async function submitQuizAnswer(token: string, req: QuizSubmitRequest): Promise<QuizSubmitResponse> {
  withAuth(token);
  await delay(400, 700);
  const q = MOCK_QUIZ_QUESTIONS.find((question) => question.id === req.questionId);
  
  if (!q) {
    return {
      correct: false,
      xpEarned: 0,
      coinsEarned: 0,
      explanation: "문제를 찾을 수 없습니다.",
      streakCount: 0,
    };
  }

  let correct = false;

  // Check answer based on question type
  if ('type' in q) {
    switch (q.type) {
      case 'multiple_choice':
        correct = req.selectedIndex === q.correctIndex;
        break;
      case 'true_false':
        correct = req.selectedAnswer === q.correctAnswer;
        break;
      case 'region_select':
        if (req.selectedRegion && q.correctRegions) {
          // Check if selected point is within any correct region
          correct = q.correctRegions.some((region) => {
            const distance = Math.sqrt(
              Math.pow(req.selectedRegion!.x - region.x, 2) +
              Math.pow(req.selectedRegion!.y - region.y, 2)
            );
            return distance <= region.radius + (q.tolerance || 0);
          });
        }
        break;
      case 'comparison':
        correct = req.selectedSide === q.correctSide;
        break;
    }
  } else {
    // Legacy support
    correct = req.selectedIndex === q.correctIndex;
  }

  return {
    correct,
    xpEarned: correct ? 100 : 10,
    coinsEarned: correct ? 25 : 0,
    explanation: q.explanation,
    streakCount: correct ? 3 : 0,
  };
}

export async function fetchQuizStats(token: string): Promise<QuizStats> {
  withAuth(token);
  await delay(300, 500);
  return { totalAnswered: 47, correctRate: 0.78, currentStreak: 3, bestStreak: 12, lives: 2 };
}

// --------------- Community Service ---------------

export async function fetchCommunityFeed(token: string, page = 1): Promise<CommunityFeed> {
  withAuth(token);
  await delay(500, 900);
  return { posts: MOCK_COMMUNITY_POSTS, totalCount: MOCK_COMMUNITY_POSTS.length, page };
}

// --------------- Video Analysis (MCP + SageMaker) ---------------

export type AnalysisEventCallback = (log: AnalysisLogEntry) => void;

export async function runVideoAnalysis(
  token: string,
  _file: File | string,
  onEvent: AnalysisEventCallback
): Promise<DeepfakeReport> {
  withAuth(token);

  const log = (message: string, type: AnalysisLogEntry["type"] = "info") =>
    onEvent({ timestamp: new Date().toISOString(), message, type });

  // Stage: UPLOADING
  log("📤 영상 파일 업로드 시작...");
  await delay(800, 1200);
  log("✅ 업로드 완료 (32.4 MB)", "success");

  // Stage: MCP_CONNECTING
  log("🔌 MCP Router에 연결 중...");
  await delay(600, 1000);
  log("🔗 MCP Session 수립 완료 (session_id: mcp_" + uuid().slice(0, 8) + ")", "success");
  log("📡 SageMaker 추론 엔드포인트로 페이로드 라우팅...");
  await delay(400, 800);

  // Stage: SAGEMAKER_PROCESSING
  log("🧠 SageMaker 추론 시작 (model: deepfind-v3.2-fp16)");
  await delay(500, 700);
  log("🔍 프레임 샘플링 중... (총 240 프레임)");
  await delay(600, 900);
  log("🔬 얼굴 영역 탐지 및 특징 추출...");
  await delay(700, 1100);
  log("📊 조작 흔적 분석 중...");
  await delay(500, 800);
  log("⚡ GAN 아티팩트 스캐닝...");
  await delay(400, 600);
  log("✅ 분석 완료!", "success");

  // Stage: COMPLETED
  return {
    taskId: "task_" + uuid().slice(0, 8),
    verdict: "fake",
    confidenceScore: 94.7,
    manipulatedRegions: [
      { label: "얼굴 영역 (입 주변)", confidence: 96.2 },
      { label: "눈 깜빡임 패턴", confidence: 91.3 },
      { label: "피부 텍스처 불일치", confidence: 88.8 },
    ],
    frameSamplesAnalyzed: 240,
    modelVersion: "deepfind-v3.2-fp16",
    processingTimeMs: 4832,
  };
}

// --------------- Payment Service ---------------

export function getSubscriptionPlans(): SubscriptionPlan[] {
  return MOCK_PLANS;
}

export async function mockCheckout(token: string, req: CheckoutRequest): Promise<CheckoutResponse> {
  withAuth(token);
  await delay(1000, 1500);
  return {
    success: true,
    transactionId: "txn_" + uuid().slice(0, 8),
    newSubscriptionType: "premium",
    expiresAt: new Date(Date.now() + (req.planId === "yearly" ? 365 : 30) * 86400000).toISOString(),
  };
}
