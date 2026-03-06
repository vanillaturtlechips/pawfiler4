// 환경 변수 중앙 관리
export const config = {
  // API Endpoints
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  quizApiUrl: import.meta.env.VITE_QUIZ_API_URL || 'http://localhost:3000/api/quiz',
  communityApiUrl: import.meta.env.VITE_COMMUNITY_API_URL || 'http://localhost:3000/api/community',
  videoAnalysisApiUrl: import.meta.env.VITE_VIDEO_ANALYSIS_API_URL || 'http://localhost:8080/video',
  paymentApiUrl: import.meta.env.VITE_PAYMENT_API_URL || 'http://localhost:8080/payment',
  
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
