import type {
  LoginRequest,
  SignupRequest,
  UserProfile,
  QuizQuestion,
  QuizSubmitRequest,
  QuizSubmitResponse,
  CommunityFeed,
  CommunityComment,
  DeepfakeReport,
  UnifiedReport,
  CheckoutRequest,
  CheckoutResponse,
  SubscriptionPlan,
  QuizStats,
  QuizGameProfile,
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
import { fixImageUrl } from "../utils/imageUrl";

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
  const isGrpc = endpoint.includes("Service/");
  
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
      xpEarned: data.xp_earned ?? 0,
      coinsEarned: data.coins_earned ?? 0,
      explanation: explanation,
      streakCount: data.streak_count ?? 0,
      correctIndex: correctIndex,
      level: data.level,
      tierName: data.tier_name,
      totalExp: data.total_exp,
      totalCoins: data.total_coins,
      energy: data.energy,
      maxEnergy: data.max_energy,
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
      totalAnswered: data.total_answered ?? 0,
      correctRate: data.correct_rate ?? 0,
      currentStreak: data.current_streak ?? 0,
      bestStreak: data.best_streak ?? 0,
      lives: data.lives ?? 3,
      level: data.level,
      tierName: data.tier_name,
      totalExp: data.total_exp,
      totalCoins: data.total_coins,
      energy: data.energy,
      maxEnergy: data.max_energy,
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
      tierName: data.tier_name ?? '알 껍데기 병아리',
      totalExp: data.total_exp ?? 0,
      totalCoins: data.total_coins ?? 0,
      energy: data.energy ?? 100,
      maxEnergy: data.max_energy ?? 100,
    };
  } catch (error) {
    return handleApiError(error, '프로필 로드');
  }
};

export const fetchCommunityFeed = async (
  page = 1, 
  pageSize = config.communityPageSize,
  searchQuery?: string,
  searchType: "title" | "body" | "all" = "title"
): Promise<CommunityFeed> => {
  try {
    const requestBody: any = {
      page,
      pageSize,
    };
    
    if (searchQuery && searchQuery.trim()) {
      requestBody.searchQuery = searchQuery.trim();
      requestBody.searchType = searchType;
    }
    
    const response = await fetch(
      `${config.communityBaseUrl}/community.CommunityService/GetFeed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // gRPC snake_case를 camelCase로 변환
    const transformedPosts: CommunityPost[] = data.posts?.map((post: any) => ({
      id: post.id,
      authorNickname: post.author_nickname || "익명",
      authorEmoji: post.author_emoji || "👤",
      title: post.title,
      body: post.body,
      likes: post.likes || 0,
      comments: post.comments || 0,
      createdAt: (post.created_at || new Date().toISOString()).replace(' ', 'T'),
      tags: post.tags || [],
      userId: post.author_id,
    })) || [];

    return {
      posts: transformedPosts,
      totalCount: data.total_count || 0,
      page: data.page || page,
    };
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
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CreatePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Failed to create post: ${response.statusText}`);
    }

    const post = await response.json();
    return {
      id: post.id,
      userId: post.author_id,
      authorNickname: post.author_nickname || req.authorNickname,
      authorEmoji: post.author_emoji || req.authorEmoji,
      title: post.title,
      body: post.body,
      likes: post.likes || 0,
      comments: post.comments || 0,
      createdAt: (post.created_at || new Date().toISOString()).replace(' ', 'T'),
      tags: post.tags || [],
    };
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
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/UpdatePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Failed to update post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '게시글 수정');
  }
};

export const deleteCommunityPost = async (postId: string, userId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/DeletePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '게시글 삭제');
  }
};

export const runVideoAnalysis = async (videoFile: File | string): Promise<DeepfakeReport> => {
  if (config.useMockApi) {
    const token = localStorage.getItem(config.storageKeys.authToken);
    return mockRunVideoAnalysis(token || "", videoFile, () => {});
  }
  
  try {
    if (typeof videoFile === 'string') {
      // URL로 분석
      const response = await request<{task_id: string, verdict: string, confidence_score: number, message: string}>(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/AnalyzeVideo`, {
        method: "POST",
        body: JSON.stringify({
          video_url: videoFile,
          user_id: localStorage.getItem(config.storageKeys.quizUserId) || ''
        }),
      });
      
      return {
        task_id: response.task_id,
        verdict: response.verdict,
        confidence_score: response.confidence_score,
        manipulated_regions: [],
        frame_samples_analyzed: 0,
        model_version: 'v1',
        processing_time_ms: 0
      };
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
      
      const response = await fetch(`${config.apiBaseUrl}/api/upload-video`, {
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
        
        const resultResponse = await request<DeepfakeReport>(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/GetAnalysisResult`, {
          method: "POST",
          body: JSON.stringify({ task_id: taskId }),
        });
        
        if (resultResponse.verdict !== 'PROCESSING' && resultResponse.verdict !== 'NOT_FOUND') {
          return resultResponse;
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
    const response = await request<UnifiedReport>(`${config.apiBaseUrl}/video_analysis.VideoAnalysisService/GetUnifiedResult`, {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    });
    return response;
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

// Community Comments & Likes
export const fetchCommunityComments = async (postId: string): Promise<CommunityComment[]> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetComments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch comments: ${response.statusText}`);
    }

    const data = await response.json();
    
    // gRPC snake_case를 camelCase로 변환
    const transformedComments: CommunityComment[] = data.comments?.map((comment: any) => ({
      id: comment.id,
      postId: comment.post_id,
      authorNickname: comment.author_nickname || "익명",
      authorEmoji: comment.author_emoji || "👤",
      body: comment.body,
      createdAt: (comment.created_at || new Date().toISOString()).replace(' ', 'T'),
      userId: comment.author_id,
    })) || [];
    
    return transformedComments;
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return [];
  }
};

export const createCommunityComment = async (req: {
  postId: string;
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  body: string;
}): Promise<CommunityComment> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CreateComment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Failed to create comment: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '댓글 작성');
  }
};

export const deleteCommunityComment = async (commentId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/DeleteComment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete comment: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '댓글 삭제');
  }
};

export const likePost = async (postId: string, userId: string): Promise<{ success: boolean; alreadyLiked?: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/LikePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to like post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '좋아요');
  }
};

export const unlikePost = async (postId: string, userId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/UnlikePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to unlike post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '좋아요 취소');
  }
};

export const getPost = async (postId: string): Promise<CommunityPost> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetPost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ post_id: postId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch post: ${response.statusText}`);
    }

    const post = await response.json();
    return {
      id: post.id,
      userId: post.author_id,
      authorNickname: post.author_nickname || "익명",
      authorEmoji: post.author_emoji || "👤",
      title: post.title,
      body: post.body,
      likes: post.likes || 0,
      comments: post.comments || 0,
      createdAt: (post.created_at || new Date().toISOString()).replace(' ', 'T'),
      tags: post.tags || [],
    };
  } catch (error) {
    return handleApiError(error, '게시글 로드');
  }
};

export const checkLike = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CheckLike`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to check like: ${response.statusText}`);
    }

    const data = await response.json();
    return data.liked || false;
  } catch (error) {
    console.error('Failed to check like:', error);
    return false;
  }
};

// Community Dashboard APIs
export const fetchNotices = async (): Promise<Array<{ id: string; title: string }>> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetNotices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch notices: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch notices:', error);
    return [];
  }
};

export const fetchTopDetective = async (): Promise<{ authorNickname: string; authorEmoji: string; totalLikes: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetTopDetective`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch top detective: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch top detective:', error);
    return { authorNickname: "아직 없음", authorEmoji: "🏆", totalLikes: 0 };
  }
};

export const fetchHotTopic = async (): Promise<{ tag: string; count: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetHotTopic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hot topic: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch hot topic:', error);
    return { tag: "없음", count: 0 };
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

export const fetchRanking = async (sortBy: string = "correct") => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/quiz.QuizService/GetRanking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_by: sortBy }),
    });
    if (!response.ok) return [];
    return await response.json();
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
    return await response.json();
  } catch {
    return [];
  }
};

// ============================
// User Service (Profile + Shop)
// ============================

export interface UserFullProfile {
  user_id: string;
  nickname: string;
  avatar_emoji: string;
  level: number;
  tier_name: string;
  total_exp: number;
  total_coins: number;
  energy: number;
  max_energy: number;
  total_quizzes: number;
  correct_rate: number;
  total_analysis: number;
  community_posts: number;
  current_streak: number;
  best_streak: number;
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
  item_name: string;
  coins_paid: number;
  total_coins: number;
}

const userServicePost = async <T>(path: string, body: object): Promise<T> => {
  const res = await fetch(`${config.apiBaseUrl}/user.UserService/${path}`, {
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
): Promise<{ success: boolean; nickname: string; avatar_emoji: string }> => {
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
  return userServicePost<ShopCatalog>("GetShopItems", {});
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
