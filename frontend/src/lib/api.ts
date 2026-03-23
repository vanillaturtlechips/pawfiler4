// report base url: api gateway (replaces lambda function url)
import type {
  LoginRequest,
  SignupRequest,
  UserProfile,
  QuizQuestion,
  QuizSubmitRequest,
  QuizSubmitResponse,
  DeepfakeReport,
  UnifiedReport,
  CheckoutRequest,
  CheckoutResponse,
  SubscriptionPlan,
  QuizStats,
  QuizGameProfile,
  MediaType,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  RegionSelectQuestion,
  ComparisonQuestion,
} from "./types";
import { 
  fetchQuizQuestion as mockFetchQuizQuestion, 
  submitQuizAnswer as mockSubmitQuizAnswer,
  mockLogin,
  mockSignup,
  runVideoAnalysis as mockRunVideoAnalysis,
  fetchQuizStats as mockFetchQuizStats,
} from "./mockApi";
import { config } from "./config";
import { toast } from "sonner";
import { fixImageUrl } from "../utils/imageUrl";

// 사용자 ID 생성 또는 가져오기 (UUID v4 형식)
export const getUserId = (): string => {
  let userId = localStorage.getItem(config.storageKeys.quizUserId);
  if (!userId) {
    // UUID v4 생성
    userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem(config.storageKeys.quizUserId, userId);
  }
  return userId;
}

// 에러 처리 헬퍼
export const handleApiError = (error: unknown, context: string): never => {
  console.error(`[API Error - ${context}]:`, error);
  
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    toast.error(`서버에 연결할 수 없습니다. 네트워크를 확인해주세요.`);
    throw new Error(`Network error in ${context}`);
  }
  
  if (error instanceof Error) {
    toast.error(error.message || `${context} 중 오류가 발생했습니다.`);
    throw error;
  }
  
  toast.error(`${context} 중 알 수 없는 오류가 발생했습니다.`);
  throw new Error(`Unknown error in ${context}`);
};

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new access token on success, or null if refresh fails.
 */
const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = typeof window !== "undefined"
    ? localStorage.getItem("refresh_token")
    : null;
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newToken = data.token as string | undefined;
    if (!newToken) return null;
    localStorage.setItem(config.storageKeys.authToken, newToken);
    if (data.refresh_token) {
      localStorage.setItem("refresh_token", data.refresh_token);
    }
    return newToken;
  } catch {
    return null;
  }
};

const request = async <T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 2
): Promise<T> => {
  const isGrpc = endpoint.includes("Service/");

  // buildHeaders is a closure that re-reads localStorage on every call so that
  // a refreshed token is automatically picked up without restarting the loop.
  const buildHeaders = (): HeadersInit => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem(config.storageKeys.authToken)
      : null;
    const h: HeadersInit = {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };
    if (!h["Content-Type"] && !(options.body instanceof FormData)) {
      h["Content-Type"] = isGrpc ? "application/grpc-web+json" : "application/json";
    }
    return h;
  };

  const url = endpoint.startsWith("http") ? endpoint : `${config.apiBaseUrl}${endpoint}`;

  let tokenRefreshed = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: buildHeaders(),
      });

      // Attempt a silent token refresh on the first 401 response.
      if (res.status === 401 && !tokenRefreshed) {
        tokenRefreshed = true;
        const newToken = await refreshAccessToken();
        if (newToken) { attempt--; continue; }
        window.dispatchEvent(new Event("auth:logout"));
        throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
      }

      if (!res.ok) {
        const body = await res.text();
        // 4xx는 클라이언트 에러이므로 재시도 없이 즉시 throw
        let message: string;
        try {
          const parsed = JSON.parse(body);
          message = parsed.error || parsed.message || body;
        } catch {
          message = body || `HTTP ${res.status}`;
        }
        // 409: 이미 가입된 이메일
        if (res.status === 409) {
          throw new Error("이미 사용 중인 이메일입니다.");
        }
        const err = new Error(message);
        (err as any).status = res.status;
        throw err;
      }

      return res.json();
    } catch (error) {
      // 4xx 에러는 재시도하지 않음
      if (error instanceof Error && (error as any).status >= 400 && (error as any).status < 500) {
        throw error;
      }
      if (attempt === retries) {
        throw error;
      }
      // 재시도 전 대기
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error('Max retries exceeded');
};

export const login = async (req: LoginRequest) => {
  if (config.useMockAuth) {
    return mockLogin(req);
  }
  try {
    const data = await request<{ token: string; refresh_token: string; user: { id: string; email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(req),
    });
    if (data.refresh_token) {
      localStorage.setItem("refresh_token", data.refresh_token);
    }
    // Build a UserProfile with defaults for fields not returned by auth service.
    // The full profile (nickname, avatar, etc.) loads lazily from user-service.
    const user: UserProfile = {
      id: data.user.id,
      email: data.user.email,
      nickname: data.user.email.split("@")[0],
      avatarEmoji: "🦊",
      subscriptionType: "free",
      coins: 0,
      level: 1,
      levelTitle: "초보 탐정",
      xp: 0,
      createdAt: new Date().toISOString(),
    };
    return { token: data.token, user };
  } catch (error) {
    return handleApiError(error, '로그인');
  }
};

export const signup = async (req: SignupRequest) => {
  if (config.useMockAuth) {
    return mockSignup(req);
  }
  try {
    // Auth service only needs email+password; nickname/avatarEmoji are stored in user-service.
    const data = await request<{ token: string; refresh_token: string; user: { id: string; email: string } }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: req.email, password: req.password }),
    });
    if (data.refresh_token) {
      localStorage.setItem("refresh_token", data.refresh_token);
    }
    const user: UserProfile = {
      id: data.user.id,
      email: data.user.email,
      nickname: req.nickname || data.user.email.split("@")[0],
      avatarEmoji: req.avatarEmoji || "🦊",
      subscriptionType: "free",
      coins: 0,
      level: 1,
      levelTitle: "초보 탐정",
      xp: 0,
      createdAt: new Date().toISOString(),
    };
    return { token: data.token, user };
  } catch (error) {
    return handleApiError(error, '회원가입');
  }
};

export const fetchQuizQuestion = async (difficulty?: string): Promise<QuizQuestion> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockFetchQuizQuestion(token || "");
  }
  
  try {
    const userId = getUserId();
    
    const body: any = { user_id: userId };
    // 난이도 파라미터 추가 (all이 아닐 때만)
    if (difficulty && difficulty !== "all") {
      body.difficulty = difficulty;
    }
    
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetRandomQuestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const errData = await response.json().catch(() => ({}));
      const energy = errData.energy ?? 0;
      throw Object.assign(new Error('insufficient_energy'), { code: 'INSUFFICIENT_ENERGY', energy });
    }
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
    const mediaType: MediaType = (data.mediaType || data.media_type) === "VIDEO" ? "video" : "image";
    
    const baseQuestion = {
      id: data.id,
      type: questionType,
      mediaType,
      mediaUrl: fixImageUrl(data.mediaUrl || data.media_url),
      thumbnailEmoji: data.thumbnailEmoji || data.thumbnail_emoji,
      difficulty: (data.difficulty?.toLowerCase() || "medium") as "easy" | "medium" | "hard",
      category: data.category || "deepfake-detection",
      explanation: data.explanation,
    };

    // 타입별로 추가 필드 포함
    switch (questionType) {
      case "multiple_choice":
        return {
          ...baseQuestion,
          type: "multiple_choice" as const,
          mediaType,
          options: data.options || [],
          correctIndex: -1, // 초기에는 정답을 모름 (답안 제출 후 업데이트)
        } as MultipleChoiceQuestion;
      case "true_false":
        return {
          ...baseQuestion,
          type: "true_false" as const,
          mediaType,
          correctAnswer: data.correctAnswer ?? data.correct_answer ?? false,
        } as TrueFalseQuestion;
      case "region_select":
        return {
          ...baseQuestion,
          type: "region_select" as const,
          mediaType: "image" as const,
          correctRegions: data.correctRegions || data.correct_regions || [],
          tolerance: data.tolerance ?? 20,
        } as RegionSelectQuestion;
      case "comparison":
        return {
          ...baseQuestion,
          type: "comparison" as const,
          mediaType: "image" as const,
          comparisonMediaUrl: fixImageUrl(data.comparisonMediaUrl || data.comparison_media_url || ""),
          correctSide: data.correctSide || data.correct_side || "left",
        } as ComparisonQuestion;
      default:
        throw new Error(`Unknown question type: ${questionType}`);
    }
  } catch (error) {
    return handleApiError(error, '퀴즈 문제 로드');
  }
};

export const submitQuizAnswer = async (req: QuizSubmitRequest): Promise<QuizSubmitResponse> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockSubmitQuizAnswer(token || "", req);
  }
  
  try {
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

    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/SubmitAnswer`, {
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
    
    // 설명에서 정답 인덱스 파싱
    let explanation = data.explanation || "";
    let correctIndex: number | undefined = undefined;
    
    const match = explanation.match(/\|\|CORRECT_INDEX:(\d+)\|\|/);
    if (match) {
      correctIndex = parseInt(match[1], 10);
      explanation = explanation.replace(/\|\|CORRECT_INDEX:\d+\|\|/, '').trim();
    }
    
    return {
      correct: data.correct ?? false,
      xpEarned: data.xpEarned ?? data.xp_earned ?? 0,
      coinsEarned: data.coinsEarned ?? data.coins_earned ?? 0,
      explanation: explanation,
      streakCount: data.streakCount ?? data.streak_count ?? 0,
      streakBonus: data.streakBonus ?? data.streak_bonus ?? 0,
      tierPromoted: data.tierPromoted ?? data.tier_promoted ?? false,
      correctIndex: correctIndex,
      level: data.level,
      tierName: data.tierName ?? data.tier_name,
      totalExp: data.totalExp ?? data.total_exp,
      totalCoins: data.totalCoins ?? data.total_coins,
      energy: data.energy,
      maxEnergy: data.maxEnergy ?? data.max_energy,
    };
  } catch (error) {
    return handleApiError(error, '답안 제출');
  }
};

export const fetchUserStats = async (): Promise<QuizStats> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockFetchQuizStats(token || "");
  }
  
  try {
    const userId = getUserId();
    
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetUserStats`, {
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
      totalAnswered: data.totalAnswered ?? data.total_answered ?? 0,
      correctRate: data.correctRate ?? data.correct_rate ?? 0,
      currentStreak: data.currentStreak ?? data.current_streak ?? 0,
      bestStreak: data.bestStreak ?? data.best_streak ?? 0,
      lives: data.lives ?? 3,
      level: data.level,
      tierName: data.tierName ?? data.tier_name,
      totalExp: data.totalExp ?? data.total_exp,
      totalCoins: data.totalCoins ?? data.total_coins,
      energy: data.energy,
      maxEnergy: data.maxEnergy ?? data.max_energy,
    };
  } catch (error) {
    return handleApiError(error, '통계 로드');
  }
};

export const fetchUserProfile = async (): Promise<QuizGameProfile> => {
  try {
    const userId = getUserId();
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetUserProfile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!response.ok) throw new Error(`Failed to fetch profile: ${response.statusText}`);
    const data = await response.json();
    return {
      level: data.level ?? 1,
      tierName: data.tierName ?? data.tier_name ?? '알 껍데기 병아리',
      totalExp: data.totalExp ?? data.total_exp ?? 0,
      totalCoins: data.totalCoins ?? data.total_coins ?? 0,
      energy: data.energy ?? 100,
      maxEnergy: data.maxEnergy ?? data.max_energy ?? 100,
    };
  } catch (error) {
    return handleApiError(error, '프로필 로드');
  }
};

export const runVideoAnalysis = async (videoFile: File | string): Promise<DeepfakeReport> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockRunVideoAnalysis(token || "", videoFile, () => {});
  }
  
  try {
    if (typeof videoFile === 'string') {
      const pollRes = await fetch(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/AnalyzeVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: videoFile,
          user_id: localStorage.getItem(config.storageKeys.quizUserId) || ''
        }),
      });
      const data = await pollRes.json();
      const taskId = data.taskId || data.task_id;

      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const r = await fetch(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/GetAnalysisResult`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId }),
        });
        const result: DeepfakeReport = await r.json();
        if (result.verdict !== 'PROCESSING' && result.verdict !== 'NOT_FOUND') return { ...result, taskId };
      }
      throw new Error('Analysis timeout');
    } else {
      // 파일 크기 체크 (100MB)
      if (videoFile.size > 100 * 1024 * 1024) {
        throw new Error('파일 크기는 100MB를 초과할 수 없습니다');
      }
      
      // 파일 업로드 - multipart로 전송
      const userId = localStorage.getItem(config.storageKeys.quizUserId) || '';
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('user_id', userId);
      
      const response = await fetch(`${config.apiBaseUrl}/upload-video`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      const taskId = data.taskId || data.task_id;
      
      // Poll for result
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const pollRes = await fetch(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/GetAnalysisResult`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId }),
        });
        const resultResponse: DeepfakeReport = await pollRes.json();
        
        if (resultResponse.verdict !== 'PROCESSING' && resultResponse.verdict !== 'NOT_FOUND') {
          return { ...resultResponse, taskId };
        }
      }
      
      throw new Error('Analysis timeout');
    }
  } catch (error) {
    return handleApiError(error, '영상 분석');
  }
};

export const getUnifiedResult = async (taskId: string): Promise<UnifiedReport> => {
  if (config.useMockApi) {
    // Mock 데이터
    return {
      taskId,
      finalVerdict: "FAKE",
      confidence: 0.87,
      visual: {
        verdict: "FAKE",
        confidence: 0.89,
        aiModel: {
          modelName: "Sora",
          confidence: 0.87,
          candidates: [
            { name: "Sora", score: 0.87 },
            { name: "Runway Gen-3", score: 0.12 },
            { name: "Pika", score: 0.01 }
          ]
        },
        framesAnalyzed: 30
      },
      audio: {
        isSynthetic: true,
        confidence: 0.82,
        method: "TTS"
      },
      warnings: [],
      totalProcessingTimeMs: 3200
    };
  }
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/GetAnalysisResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId }),
    });
    const data = await response.json();
    // DeepfakeReport → UnifiedReport 변환
    return {
      taskId,
      finalVerdict: data.verdict || "UNCERTAIN",
      confidence: data.confidence_score || 0,
      visual: data.breakdown?.video ? {
        verdict: data.breakdown.video.is_fake ? "FAKE" : "REAL",
        confidence: data.breakdown.video.confidence || 0,
        aiModel: data.breakdown.video.ai_model ? {
          modelName: data.breakdown.video.ai_model,
          confidence: data.breakdown.video.confidence || 0,
          candidates: []
        } : undefined,
        framesAnalyzed: data.frame_samples_analyzed || 0,
      } : undefined,
      audio: data.breakdown?.audio ? {
        isSynthetic: data.breakdown.audio.is_synthetic || false,
        confidence: data.breakdown.audio.confidence || 0,
        method: data.breakdown.audio.voice_model || "unknown",
      } : undefined,
      warnings: [],
      totalProcessingTimeMs: data.processing_time_ms || 0,
    };
  } catch (error) {
    return handleApiError(error, '통합 결과 조회');
  }
};

export const getSubscriptionPlans = async (): Promise<SubscriptionPlan[]> => {
  if (config.useMockApi) {
    const { getSubscriptionPlans: mockGetPlans } = await import('./mockApi');
    return mockGetPlans();
  }
  
  try {
    const result = await request<{ plans: SubscriptionPlan[] }>(`${config.apiBaseUrl}/payment.PaymentService/GetPlans`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return result.plans;
  } catch (error) {
    return handleApiError(error, '구독 플랜 로드');
  }
};

export const checkout = async (req: CheckoutRequest): Promise<CheckoutResponse> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    const { mockCheckout } = await import('./mockApi');
    return mockCheckout(token || "", req);
  }
  
  try {
    return await request<CheckoutResponse>(`${config.apiBaseUrl}/payment.PaymentService/Checkout`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '결제');
  }
};

export const refillEnergy = async (): Promise<void> => {
  const userId = getUserId();
  await fetch(`${config.apiBaseUrl}/quiz.QuizService/RefillEnergy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
};

export const syncProfileToQuiz = async (nickname: string, avatarEmoji: string): Promise<void> => {
  const userId = getUserId();
  if (!userId || !nickname) return;
  await fetch(`${config.apiBaseUrl}/quiz.QuizService/UpdateUserProfile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, nickname, avatar_emoji: avatarEmoji }),
  }).catch(() => {});
};

export const syncAuthorToCommunity = async (userId: string, nickname: string, avatarEmoji: string): Promise<void> => {
  if (!userId || !nickname) return;
  await fetch(`${config.communityBaseUrl}/community.CommunityService/SyncAuthorNickname`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, nickname, avatar_emoji: avatarEmoji }),
  }).catch(() => {});
};

export const fetchRanking = async (sortBy: string = "correct") => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetRanking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_by: sortBy }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const entries: any[] = Array.isArray(data) ? data : (data.entries ?? []);
    // quiz 서비스 snake_case/camelCase → RankingPage/CommunityDashboard 필드로 정규화
    return entries.map((e: any) => ({
      rank: e.rank ?? 0,
      userId: e.userId || e.user_id || "",
      nickname: e.nickname || "",
      avatarEmoji: e.emoji || e.avatarEmoji || e.avatar_emoji || "🥚",
      tier: e.tierName || e.tier_name || e.tier || "알",
      level: e.level ?? 1,
      totalExp: e.totalExp || e.total_exp || 0,
      totalCoins: e.totalCoins || e.total_coins || 0,
      totalAnswered: e.totalAnswered || e.total_answered || 0,
      correctCount: e.correctAnswers || e.correct_answers || e.correctCount || 0,
      accuracy: e.totalAnswered || e.total_answered
        ? Math.round(((e.correctAnswers || e.correct_answers || 0) / (e.totalAnswered || e.total_answered)) * 100)
        : 0,
    }));
  } catch {
    return [];
  }
};

export const fetchQuestionStats = async (questionId?: string) => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetQuestionStats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questionId ? { question_id: questionId } : {}),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : (data.stats ?? []);
  } catch {
    return [];
  }
};

// ============================
// User Service (Profile + Shop)
// ============================

export interface UserFullProfile {
  userId: string;
  user_id?: string;
  nickname: string;
  avatarEmoji: string;
  avatar_emoji?: string;
  level: number;
  tierName: string;
  tier_name?: string;
  totalExp: number;
  total_exp?: number;
  totalCoins: number;
  total_coins?: number;
  energy: number;
  maxEnergy: number;
  max_energy?: number;
  totalQuizzes: number;
  total_quizzes?: number;
  correctRate: number;
  correct_rate?: number;
  totalAnalysis: number;
  total_analysis?: number;
  communityPosts: number;
  community_posts?: number;
  currentStreak: number;
  current_streak?: number;
  bestStreak: number;
  best_streak?: number;
  totalLikesReceived?: number;
  total_likes_received?: number;
  totalCommentsWritten?: number;
  total_comments_written?: number;
  suspiciousVideos?: number;
  suspicious_videos?: number;
  avgConfidence?: number;
  avg_confidence?: number;
}

export interface UserActivity {
  icon: string;
  title: string;
  time: string;
  xp: number;
}

export interface ShopItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  badge?: string;
  type: string;
  quantity?: number;
  bonus?: number;
}

export interface ShopCatalog {
  subscriptions: ShopItemData[];
  coin_packages: ShopItemData[];
  packages: ShopItemData[];
}

export interface PurchaseResult {
  success: boolean;
  itemName?: string;
  item_name?: string;
  coinsPaid?: number;
  coins_paid?: number;
  totalCoins?: number;
  total_coins?: number;
}

const userServicePost = async <T>(path: string, body: object): Promise<T> => {
  const res = await fetch(`${config.userServiceBaseUrl}/user.UserService/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  }
  return data as T;
};

export const fetchUserFullProfile = async (userId: string): Promise<UserFullProfile> => {
  return userServicePost<UserFullProfile>("GetProfile", { user_id: userId });
};

export const updateUserProfile = async (
  userId: string,
  nickname?: string,
  avatarEmoji?: string
): Promise<{ success: boolean; nickname: string; avatarEmoji?: string; avatar_emoji?: string }> => {
  return userServicePost("UpdateProfile", {
    user_id: userId,
    ...(nickname && { nickname }),
    ...(avatarEmoji && { avatar_emoji: avatarEmoji }),
  });
};

export const fetchUserActivities = async (userId: string): Promise<UserActivity[]> => {
  const res = await userServicePost<{ activities: UserActivity[] }>("GetRecentActivities", { user_id: userId });
  return res.activities ?? [];
};

export const fetchShopItems = async (): Promise<ShopCatalog> => {
  const res = await userServicePost<{ items: ShopItemData[] }>("GetShopItems", {});
  const items = res.items ?? [];
  return {
    subscriptions: items.filter((i) => i.type === "subscription"),
    coin_packages: items.filter((i) => i.type === "coin_package" || i.type === "coins"),
    packages: items.filter((i) => i.type !== "subscription" && i.type !== "coin_package" && i.type !== "coins"),
  };
};

export const purchaseItem = async (userId: string, itemId: string): Promise<PurchaseResult> => {
  return userServicePost<PurchaseResult>("PurchaseItem", { user_id: userId, item_id: itemId });
};

export const fetchPurchaseHistory = async (userId: string) => {
  return userServicePost<{ purchases: object[] }>("GetPurchaseHistory", { user_id: userId });
};

// ─── Admin Shop API ────────────────────────────────────────────────────────────

export interface AdminShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  badge?: string;
  type: string;
  quantity: number;
  bonus: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminShopItemInput {
  id?: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  badge?: string;
  type: string;
  quantity?: number;
  bonus?: number;
  is_active?: boolean;
  sort_order?: number;
}

const adminFetch = async <T>(method: string, path: string, body?: object): Promise<T> => {
  const res = await fetch(`${config.adminServiceBaseUrl}/admin/shop${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  }
  return data as T;
};

export const adminFetchShopItems = async (): Promise<{ items: AdminShopItem[]; total: number }> =>
  adminFetch("GET", "/items");

export const adminCreateShopItem = async (input: AdminShopItemInput): Promise<AdminShopItem> =>
  adminFetch("POST", "/items", input);

export const adminUpdateShopItem = async (id: string, input: Partial<AdminShopItemInput>): Promise<AdminShopItem> =>
  adminFetch("PUT", `/items/${id}`, input);

export const adminDeleteShopItem = async (id: string): Promise<void> =>
  adminFetch("DELETE", `/items/${id}`);

// Report Service
const REPORT_BASE_URL = import.meta.env.VITE_REPORT_BASE_URL || '';

export const generateReport = async (days?: number | null): Promise<{ report_url: string }> => {
  const userId = getUserId();
  const savedUser = localStorage.getItem('auth_user');
  const user = savedUser ? JSON.parse(savedUser) : null;

  const response = await fetch(`${REPORT_BASE_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      days: days ?? null,
      nickname: user?.nickname || null,
      avatar_emoji: user?.avatarEmoji || null,
      email: user?.email || null,
      subscription_type: user?.subscriptionType || "free",
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "리포트 생성에 실패했어요.");
  }
  return response.json();
};

export const downloadReport = (userId: string) => {
  window.open(`${REPORT_BASE_URL}/download/${userId}`, '_blank');
};

// ── 분석 이력 / 횟수 / API 키 ──────────────────────────────

export interface AnalysisHistoryItem {
  task_id: string;
  final_verdict: "REAL" | "FAKE" | "UNCERTAIN";
  confidence: number;
  ai_model: string | null;
  created_at: string;
  video_url: string;
}

export interface AnalysisQuota {
  used: number;
  limit: number;   // -1 = 무제한 (premium)
  remaining: number;
  premium?: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  key?: string; // 생성 직후에만 존재
}

const VIDEO_ANALYSIS_REST = config.apiBaseUrl.replace('/api', '') + ':8080';

export const fetchAnalysisHistory = async (userId: string): Promise<AnalysisHistoryItem[]> => {
  try {
    const res = await fetch(`${VIDEO_ANALYSIS_REST}/api/analysis/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    return data.history ?? [];
  } catch {
    return [];
  }
};

export const fetchAnalysisQuota = async (userId: string): Promise<AnalysisQuota> => {
  try {
    const res = await fetch(`${VIDEO_ANALYSIS_REST}/api/analysis/quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    return await res.json();
  } catch {
    return { used: 0, limit: 5, remaining: 5 };
  }
};

export const fetchApiKeys = async (userId: string): Promise<ApiKeyItem[]> => {
  try {
    const res = await fetch(`${VIDEO_ANALYSIS_REST}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    return data.keys ?? [];
  } catch {
    return [];
  }
};

export const generateApiKey = async (userId: string, name: string): Promise<ApiKeyItem> => {
  const res = await fetch(`${VIDEO_ANALYSIS_REST}/api/keys/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, name }),
  });
  if (!res.ok) throw new Error('API 키 생성 실패');
  return res.json();
};

export const revokeApiKey = async (userId: string, keyId: string): Promise<void> => {
  await fetch(`${VIDEO_ANALYSIS_REST}/api/keys/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, key_id: keyId }),
  });
};
