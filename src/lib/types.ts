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
export type QuestionType = "multiple_choice" | "true_false" | "region_select" | "comparison";

export type MediaType = "video" | "image";

export interface BaseQuizQuestion {
  id: string;
  type: QuestionType;
  mediaType: MediaType;
  mediaUrl: string;
  thumbnailEmoji: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  explanation: string;
}

// 객관식 (Multiple Choice)
export interface MultipleChoiceQuestion extends BaseQuizQuestion {
  type: "multiple_choice";
  options: string[];
  correctIndex: number;
}

// OX 퀴즈 (True/False)
export interface TrueFalseQuestion extends BaseQuizQuestion {
  type: "true_false";
  correctAnswer: boolean; // true = 진짜, false = 가짜
}

// 영역 선택 (Region Select) - 이미지만
export interface RegionSelectQuestion extends BaseQuizQuestion {
  type: "region_select";
  mediaType: "image";
  correctRegions: { x: number; y: number; radius: number }[]; // 정답 영역들 (원형)
  tolerance: number; // 허용 오차 (픽셀)
}

// 비교 문제 (Comparison) - 이미지만
export interface ComparisonQuestion extends BaseQuizQuestion {
  type: "comparison";
  mediaType: "image";
  mediaUrl: string; // 첫 번째 이미지
  comparisonMediaUrl: string; // 두 번째 이미지
  correctSide: "left" | "right"; // 어느 쪽이 진짜인지
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | RegionSelectQuestion
  | ComparisonQuestion;

// 기존 호환성을 위한 레거시 타입 (deprecated)
export interface LegacyQuizQuestion {
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
  selectedIndex?: number; // multiple_choice용
  selectedAnswer?: boolean; // true_false용
  selectedRegion?: { x: number; y: number }; // region_select용
  selectedSide?: "left" | "right"; // comparison용
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
