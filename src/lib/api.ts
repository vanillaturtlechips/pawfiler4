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
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isCommunity = endpoint.includes(":50053");
  const isGrpc = endpoint.includes("Service/") && !isCommunity;
  
  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = isGrpc ? "application/grpc-web+json" : "application/json";
  }

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

export const login = (req: LoginRequest) =>
  request<{ token: string; user: UserProfile }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const signup = (req: SignupRequest) =>
  request<{ token: string; user: UserProfile }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const fetchQuizQuestion = () =>
  request<QuizQuestion>("http://localhost:50052/quiz.QuizService/GetQuestion", { method: "POST", body: JSON.stringify({}) });

export const submitQuizAnswer = (req: QuizSubmitRequest) =>
  request<QuizSubmitResponse>("/quiz/quiz.QuizService/SubmitAnswer", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const fetchCommunityFeed = (page = 1, pageSize = 20) =>
  request<CommunityFeed>("http://localhost:50053/community.CommunityService/GetFeed", {
    method: "POST",
    body: JSON.stringify({ page, page_size: pageSize }),
  });

export const createCommunityPost = (req: {
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  title: string;
  body: string;
  tags: string[];
}) =>
  request<CommunityPost>("http://localhost:50053/community.CommunityService/CreatePost", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const updateCommunityPost = (req: {
  postId: string;
  title: string;
  body: string;
  tags: string[];
}) =>
  request<CommunityPost>("http://localhost:50053/community.CommunityService/UpdatePost", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const deleteCommunityPost = (postId: string) =>
  request<{ success: boolean }>("http://localhost:50053/community.CommunityService/DeletePost", {
    method: "POST",
    body: JSON.stringify({ postId }),
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
