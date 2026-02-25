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
  AnalysisLogEntry,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

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

export const fetchQuizQuestion = () =>
  request<QuizQuestion>("http://localhost:50052/quiz.QuizService/GetQuestion", { method: "POST", body: JSON.stringify({}) });

export const submitQuizAnswer = (req: QuizSubmitRequest) =>
  request<QuizSubmitResponse>("/quiz/quiz.QuizService/SubmitAnswer", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const fetchCommunityFeed = () =>
  request<CommunityFeed>("http://localhost:50053/community.CommunityService/GetFeed", {
    method: "POST",
    body: JSON.stringify({ page: 1, limit: 20 }),
  });

export const runVideoAnalysis = async (
  token: string,
  fileOrUrl: File | string,
  onEvent: (log: import("./types").AnalysisLogEntry) => void
): Promise<DeepfakeReport> => {
  // In dev, use mock; in prod, use real API
  const { runVideoAnalysis: mockRun } = await import("./mockApi");
  return mockRun(token, fileOrUrl, onEvent);
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
