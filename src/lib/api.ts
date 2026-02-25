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
import { fetchQuizQuestion as mockFetchQuizQuestion, submitQuizAnswer as mockSubmitQuizAnswer } from "./mockApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const USE_MOCK = true; // 임시로 mock 사용

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

export const fetchQuizQuestion = () => {
  if (USE_MOCK) {
    const token = localStorage.getItem("token");
    return mockFetchQuizQuestion(token || "");
  }
  return request<QuizQuestion>("http://localhost:50052/quiz.QuizService/GetQuestion", { method: "POST", body: JSON.stringify({}) });
};

export const submitQuizAnswer = (req: QuizSubmitRequest) => {
  if (USE_MOCK) {
    const token = localStorage.getItem("token");
    return mockSubmitQuizAnswer(token || "", req);
  }
  return request<QuizSubmitResponse>("/quiz/quiz.QuizService/SubmitAnswer", {
    method: "POST",
    body: JSON.stringify(req),
  });
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
