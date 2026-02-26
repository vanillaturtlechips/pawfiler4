import type {
  LoginRequest,
  SignupRequest,
  UserProfile,
  QuizQuestion,
  QuizSubmitRequest,
  QuizSubmitResponse,
  CommunityFeed,
  DeepfakeReport,
  CheckoutRequest,
  CheckoutResponse,
  SubscriptionPlan,
  QuizStats,
} from "./types";
import { 
  fetchQuizQuestion as mockFetchQuizQuestion, 
  submitQuizAnswer as mockSubmitQuizAnswer,
  mockLogin,
  mockSignup,
} from "./mockApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const QUIZ_PROXY_URL = "http://localhost:3001/api/quiz"; // HTTP REST 프록시
const USE_MOCK = false; // 퀴즈는 실제 백엔드 사용
const USE_MOCK_AUTH = true; // 인증은 mock 사용

// 사용자 ID 생성 또는 가져오기 (UUID v4 형식)
const getUserId = (): string => {
  let userId = localStorage.getItem("quiz_user_id");
  if (!userId) {
    // UUID v4 생성
    userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem("quiz_user_id", userId);
  }
  return userId;
}

const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = localStorage.getItem("token");
  const isGrpc = endpoint.includes("Service/");
  const headers: HeadersInit = {
    "Content-Type": isGrpc ? "application/grpc-web+json" : "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `HTTP ${res.status}`);
  }

  return res.json();
};

export const login = async (req: LoginRequest) => {
  if (USE_MOCK_AUTH) {
    return mockLogin(req);
  }
  return request<{ token: string; user: UserProfile }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(req),
  });
};

export const signup = async (req: SignupRequest) => {
  if (USE_MOCK_AUTH) {
    return mockSignup(req);
  }
  return request<{ token: string; user: UserProfile }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(req),
  });
};

export const fetchQuizQuestion = async (): Promise<QuizQuestion> => {
  if (USE_MOCK) {
    const token = localStorage.getItem("token");
    return mockFetchQuizQuestion(token || "");
  }
  
  const userId = getUserId();
  
  // HTTP REST 프록시를 통한 요청
  const response = await fetch(`${QUIZ_PROXY_URL}/random`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch question: ${response.statusText}`);
  }

  const data = await response.json();
  
  // gRPC 응답을 프론트엔드 타입으로 변환 (snake_case -> camelCase)
  const typeMap: { [key: string]: QuizQuestion["type"] } = {
    "MULTIPLE_CHOICE": "multiple_choice",
    "TRUE_FALSE": "true_false",
    "REGION_SELECT": "region_select",
    "COMPARISON": "comparison",
  };
  
  const questionType = typeMap[data.type] || "multiple_choice";
  const mediaType = data.media_type === "VIDEO" ? "video" : "image";
  
  const baseQuestion = {
    id: data.id,
    type: questionType,
    mediaType,
    mediaUrl: data.media_url,
    thumbnailEmoji: data.thumbnail_emoji,
    difficulty: (data.difficulty?.toLowerCase() || "medium") as "easy" | "medium" | "hard",
    category: data.category || "deepfake-detection",
    explanation: data.explanation,
  };

  // 타입별로 추가 필드 포함
  switch (questionType) {
    case "multiple_choice":
      return {
        ...baseQuestion,
        type: "multiple_choice",
        options: data.options || [],
        correctIndex: data.correct_index ?? 0,
      };
    case "true_false":
      return {
        ...baseQuestion,
        type: "true_false",
        correctAnswer: data.correct_answer ?? false,
      };
    case "region_select":
      return {
        ...baseQuestion,
        type: "region_select",
        mediaType: "image",
        correctRegions: data.correct_regions || [],
        tolerance: data.tolerance ?? 20,
      };
    case "comparison":
      return {
        ...baseQuestion,
        type: "comparison",
        mediaType: "image",
        comparisonMediaUrl: data.comparison_media_url || "",
        correctSide: data.correct_side || "left",
      };
    default:
      throw new Error(`Unknown question type: ${questionType}`);
  }
};

export const submitQuizAnswer = async (req: QuizSubmitRequest): Promise<QuizSubmitResponse> => {
  if (USE_MOCK) {
    const token = localStorage.getItem("token");
    return mockSubmitQuizAnswer(token || "", req);
  }
  
  const userId = getUserId();
  
  // gRPC 요청 본문 생성
  const requestBody: any = {
    user_id: userId,
    question_id: req.questionId,
  };

  // 답변 타입에 따라 필드 추가
  if (req.selectedIndex !== undefined) {
    requestBody.selected_index = req.selectedIndex;
  }
  if (req.selectedAnswer !== undefined) {
    requestBody.selected_answer = req.selectedAnswer;
  }
  if (req.selectedRegion) {
    requestBody.selected_region = req.selectedRegion;
  }
  if (req.selectedSide) {
    requestBody.selected_side = req.selectedSide;
  }

  const response = await fetch(`${QUIZ_PROXY_URL}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit answer: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    correct: data.correct ?? false,
    xpEarned: data.xp_earned ?? 0,
    coinsEarned: data.coins_earned ?? 0,
    explanation: data.explanation || "",
    streakCount: data.streak_count ?? 0,
  };
};

export const fetchUserStats = async (): Promise<QuizStats> => {
  const userId = getUserId();
  
  const response = await fetch(`${QUIZ_PROXY_URL}/stats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user stats: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    totalAnswered: data.total_answered ?? 0,
    correctRate: data.correct_rate ?? 0,
    currentStreak: data.current_streak ?? 0,
    bestStreak: data.best_streak ?? 0,
    lives: data.lives ?? 3,
  };
};

export const fetchCommunityFeed = () =>
  request<CommunityFeed>("http://localhost:50053/community.CommunityService/GetFeed", {
    method: "POST",
    body: JSON.stringify({ page: 1, limit: 20 }),
  });

export const runVideoAnalysis = (videoFile: File) => {
  const formData = new FormData();
  formData.append("video", videoFile);
  return request<DeepfakeReport>("/video/video.VideoAnalysisService/AnalyzeVideo", {
    method: "POST",
    body: formData,
    headers: {},
  });
};

export const getSubscriptionPlans = () =>
  request<{ plans: SubscriptionPlan[] }>("http://localhost:50055/payment.PaymentService/GetPlans", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const checkout = (req: CheckoutRequest) =>
  request<CheckoutResponse>("/payment/payment.PaymentService/Checkout", {
    method: "POST",
    body: JSON.stringify(req),
  });
