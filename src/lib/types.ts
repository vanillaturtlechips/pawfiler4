// ============================
// Backend Microservice Interfaces
// ============================

// --- Auth Service ---
export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  nickname: string;
  avatarEmoji: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  nickname: string;
  avatarEmoji: string;
  role: "free" | "premium";
  iat: number;
  exp: number;
}

export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarEmoji: string;
  subscriptionType: "free" | "premium";
  coins: number;
  level: number;
  levelTitle: string;
  xp: number;
  createdAt: string;
}

// --- Quiz Service ---
export interface QuizQuestion {
  id: string;
  videoUrl: string;
  thumbnailEmoji: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface QuizSubmitRequest {
  questionId: string;
  selectedIndex: number;
}

export interface QuizSubmitResponse {
  correct: boolean;
  xpEarned: number;
  coinsEarned: number;
  explanation: string;
  streakCount: number;
}

export interface QuizStats {
  totalAnswered: number;
  correctRate: number;
  currentStreak: number;
  bestStreak: number;
  lives: number;
}

// --- Community Service ---
export interface CommunityPost {
  id: string;
  authorNickname: string;
  authorEmoji: string;
  title: string;
  body: string;
  likes: number;
  comments: number;
  createdAt: string;
  tags: string[];
  userId?: string;
}

export interface CommunityFeed {
  posts: CommunityPost[];
  totalCount: number;
  page: number;
}

// --- Video Analysis Service (MCP / SageMaker) ---
export type AnalysisStage =
  | "IDLE"
  | "UPLOADING"
  | "MCP_CONNECTING"
  | "SAGEMAKER_PROCESSING"
  | "COMPLETED"
  | "ERROR";

export interface AnalysisLogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export interface DeepfakeReport {
  taskId: string;
  verdict: "real" | "fake" | "uncertain";
  confidenceScore: number;
  manipulatedRegions: { label: string; confidence: number }[];
  frameSamplesAnalyzed: number;
  modelVersion: string;
  processingTimeMs: number;
}

// --- Dashboard Service (BFF) ---
export interface DashboardAggregated {
  user: UserProfile;
  quizStats: QuizStats;
  recentPosts: CommunityPost[];
  dailyChallenge: {
    title: string;
    progress: number;
    total: number;
    reward: number;
  };
}

// --- Payment Service ---
export interface CheckoutRequest {
  planId: "monthly" | "yearly";
}

export interface CheckoutResponse {
  success: boolean;
  transactionId: string;
  newSubscriptionType: "premium";
  expiresAt: string;
}

export interface SubscriptionPlan {
  id: "monthly" | "yearly";
  name: string;
  price: number;
  currency: string;
  features: string[];
}
