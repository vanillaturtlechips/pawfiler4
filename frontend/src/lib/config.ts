// 환경 변수 중앙 관리
export const config = {
  // API Endpoints
  // 로컬: quiz=8080, community=8081
  // 클라우드: Envoy/ALB가 라우팅하므로 동일 URL 사용
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  communityBaseUrl: import.meta.env.VITE_COMMUNITY_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081',
  
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
