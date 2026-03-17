// www → non-www 정규화
const _origin = typeof window !== 'undefined'
  ? window.location.origin.replace('//www.', '//')
  : '';
const _isProd = _origin.includes('pawfiler.site');

export const config = {
  apiBaseUrl: _isProd ? `${_origin}/api` : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'),
  communityBaseUrl: _isProd ? `${_origin}/api` : (import.meta.env.VITE_COMMUNITY_BASE_URL || 'http://localhost:8081'),
  adminServiceBaseUrl: import.meta.env.VITE_ADMIN_SERVICE_BASE_URL || 'http://localhost:8082',
  
  // Feature Flags
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  useMockAuth: import.meta.env.VITE_USE_MOCK_AUTH !== 'false',
  
  // App Config
  appName: import.meta.env.VITE_APP_NAME || 'PawFiler',
  tutorialStorageKey: import.meta.env.VITE_TUTORIAL_STORAGE_KEY || 'pawfiler_tutorial_seen',
  
  // Game Config
  quizQuestionsPerGame: 10,
  quizTimeout: 30000,
  
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
