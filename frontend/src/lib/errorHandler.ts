import { toast } from "sonner";

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NetworkError extends AppError {
  constructor(message = "네트워크 연결을 확인해주세요") {
    super(message, "NETWORK_ERROR", 0);
    this.name = "NetworkError";
  }
}

export class AuthError extends AppError {
  constructor(message = "인증이 필요합니다") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "요청한 리소스를 찾을 수 없습니다") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ServerError extends AppError {
  constructor(message = "서버 오류가 발생했습니다") {
    super(message, "SERVER_ERROR", 500);
    this.name = "ServerError";
  }
}

export function handleError(error: unknown, context?: string): AppError {
  console.error(`[Error${context ? ` - ${context}` : ""}]:`, error);

  // 네트워크 에러
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return new NetworkError();
  }

  // 이미 AppError인 경우
  if (error instanceof AppError) {
    return error;
  }

  // HTTP 에러
  if (error instanceof Response) {
    if (error.status === 401) return new AuthError();
    if (error.status === 404) return new NotFoundError();
    if (error.status >= 500) return new ServerError();
  }

  // 일반 에러
  if (error instanceof Error) {
    return new AppError(error.message);
  }

  // 알 수 없는 에러
  return new AppError("알 수 없는 오류가 발생했습니다");
}

export function showErrorToast(error: unknown, context?: string) {
  const appError = handleError(error, context);
  
  toast.error(appError.message, {
    description: context,
    duration: 5000,
  });
  
  return appError;
}
