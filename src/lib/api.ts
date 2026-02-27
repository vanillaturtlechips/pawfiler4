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
  CommunityPost,
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
  fetchCommunityFeed as mockFetchCommunityFeed,
  runVideoAnalysis as mockRunVideoAnalysis,
  fetchQuizStats as mockFetchQuizStats,
} from "./mockApi";
import { config } from "./config";
import { toast } from "sonner";

// 사용자 ID 생성 또는 가져오기 (UUID v4 형식)
const getUserId = (): string => {
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
const handleApiError = (error: unknown, context: string): never => {
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

const request = async <T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 2
): Promise<T> => {
  const token = typeof window !== "undefined" ? localStorage.getItem(config.storageKeys.authToken) : null;
  const isCommunity = endpoint.includes(config.communityApiUrl);
  const isGrpc = endpoint.includes("Service/") && !isCommunity;
  
  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = isGrpc ? "application/grpc-web+json" : "application/json";
  }

  const url = endpoint.startsWith("http") ? endpoint : `${config.apiBaseUrl}${endpoint}`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || `HTTP ${res.status}`);
      }

      return res.json();
    } catch (error) {
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
    return await request<{ token: string; user: UserProfile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '로그인');
  }
};

export const signup = async (req: SignupRequest) => {
  if (config.useMockAuth) {
    return mockSignup(req);
  }
  try {
    return await request<{ token: string; user: UserProfile }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '회원가입');
  }
};

export const fetchQuizQuestion = async (): Promise<QuizQuestion> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockFetchQuizQuestion(token || "");
  }
  
  try {
    const userId = getUserId();
    
    // HTTP REST 프록시를 통한 요청
    const response = await fetch(`${config.quizApiUrl}/random`, {
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
    const mediaType: MediaType = data.media_type === "VIDEO" ? "video" : "image";
    
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
          type: "multiple_choice" as const,
          mediaType,
          options: data.options || [],
          correctIndex: data.correct_index ?? 0,
        } as MultipleChoiceQuestion;
      case "true_false":
        return {
          ...baseQuestion,
          type: "true_false" as const,
          mediaType,
          correctAnswer: data.correct_answer ?? false,
        } as TrueFalseQuestion;
      case "region_select":
        return {
          ...baseQuestion,
          type: "region_select" as const,
          mediaType: "image" as const,
          correctRegions: data.correct_regions || [],
          tolerance: data.tolerance ?? 20,
        } as RegionSelectQuestion;
      case "comparison":
        return {
          ...baseQuestion,
          type: "comparison" as const,
          mediaType: "image" as const,
          comparisonMediaUrl: data.comparison_media_url || "",
          correctSide: data.correct_side || "left",
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

    const response = await fetch(`${config.quizApiUrl}/submit`, {
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
    
    const response = await fetch(`${config.quizApiUrl}/stats`, {
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
  } catch (error) {
    return handleApiError(error, '통계 로드');
  }
};

export const fetchCommunityFeed = async (page = 1, pageSize = config.communityPageSize): Promise<CommunityFeed> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockFetchCommunityFeed(token || "", page);
  }
  
  try {
    return await request<CommunityFeed>(`${config.communityApiUrl}/community.CommunityService/GetFeed`, {
      method: "POST",
      body: JSON.stringify({ page, page_size: pageSize }),
    });
  } catch (error) {
    return handleApiError(error, '커뮤니티 피드 로드');
  }
};

export const createCommunityPost = async (req: {
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  title: string;
  body: string;
  tags: string[];
}): Promise<CommunityPost> => {
  if (config.useMockApi) {
    // Mock API는 CommunityPost를 직접 반환
    const mockPost: CommunityPost = {
      id: `post_${Date.now()}`,
      userId: req.userId,
      authorNickname: req.authorNickname,
      authorEmoji: req.authorEmoji,
      title: req.title,
      body: req.body,
      tags: req.tags,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString(),
    };
    return Promise.resolve(mockPost);
  }
  
  try {
    return await request<CommunityPost>(`${config.communityApiUrl}/community.CommunityService/CreatePost`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '게시글 작성');
  }
};

export const updateCommunityPost = async (req: {
  postId: string;
  title: string;
  body: string;
  tags: string[];
}): Promise<CommunityPost> => {
  if (config.useMockApi) {
    // Mock: 기존 게시글 업데이트 시뮬레이션
    const mockPost: CommunityPost = {
      id: req.postId,
      userId: 'mock_user',
      authorNickname: '익명 탐정',
      authorEmoji: '🕵️',
      title: req.title,
      body: req.body,
      tags: req.tags,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString(),
    };
    return Promise.resolve(mockPost);
  }
  
  try {
    return await request<CommunityPost>(`${config.communityApiUrl}/community.CommunityService/UpdatePost`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '게시글 수정');
  }
};

export const deleteCommunityPost = async (postId: string): Promise<{ success: boolean }> => {
  if (config.useMockApi) {
    return Promise.resolve({ success: true });
  }
  
  try {
    return await request<{ success: boolean }>(`${config.communityApiUrl}/community.CommunityService/DeletePost`, {
      method: "POST",
      body: JSON.stringify({ postId }),
    });
  } catch (error) {
    return handleApiError(error, '게시글 삭제');
  }
};

export const runVideoAnalysis = async (videoFile: File | string): Promise<DeepfakeReport> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    // Mock API는 콜백 함수를 받지만, 여기서는 사용하지 않음
    return mockRunVideoAnalysis(token || "", videoFile, () => {});
  }
  
  try {
    const formData = new FormData();
    if (videoFile instanceof File) {
      formData.append("video", videoFile);
    }
    
    return await request<DeepfakeReport>(`${config.videoAnalysisApiUrl}/video.VideoAnalysisService/AnalyzeVideo`, {
      method: "POST",
      body: formData,
      headers: {},
    });
  } catch (error) {
    return handleApiError(error, '영상 분석');
  }
};

export const getSubscriptionPlans = async (): Promise<SubscriptionPlan[]> => {
  if (config.useMockApi) {
    const { getSubscriptionPlans: mockGetPlans } = await import('./mockApi');
    return mockGetPlans();
  }
  
  try {
    const result = await request<{ plans: SubscriptionPlan[] }>(`${config.paymentApiUrl}/payment.PaymentService/GetPlans`, {
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
    return await request<CheckoutResponse>(`${config.paymentApiUrl}/payment.PaymentService/Checkout`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (error) {
    return handleApiError(error, '결제');
  }
};
