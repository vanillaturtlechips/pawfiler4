// 환경 변수 중앙 관리
export const config = {
  // API Endpoints - Envoy Gateway를 통한 연결
  // 로컬: http://localhost:8080
  // 클라우드: EKS Envoy Gateway LoadBalancer URL (예: http://a1234567890.ap-northeast-2.elb.amazonaws.com)
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  
  // Feature Flags
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  useMockAuth: import.meta.env.VITE_USE_MOCK_AUTH !== 'false',
  
  // App Config
  appName: import.meta.env.VITE_APP_NAME || 'PawFiler',
  tutorialStorageKey: import.meta.env.VITE_TUTORIAL_STORAGE_KEY || 'pawfiler_tutorial_seen',
  
  // Game Config
  quizQuestionsPerGame: 10,
  quizTimeout: 30000, // 30 seconds
  
  // Pagination
  communityPageSize: 15,
  
  // Storage Keys
  storageKeys: {
    authToken: 'auth_token',
    authUser: 'auth_user',
    quizUserId: 'quiz_user_id',
    tutorial: 'pawfiler_tutorial_seen',
  },
} as const;

export type Config = typeof config;
