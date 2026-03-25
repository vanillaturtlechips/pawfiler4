const AIOPS_API_URL = import.meta.env.VITE_AIOPS_API_URL || import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:8090';

export interface PodInfo {
  name: string;
  phase: string;
  containers: { name: string; ready: boolean; restart_count: number; state: string; reason: string }[];
}

export interface AnalysisResult {
  timestamp: number;
  anomaly: boolean;
  summary: string;
  pods?: {
    pawfiler: { total: number; abnormal_count: number; abnormal: PodInfo[] };
    admin: { total: number; abnormal_count: number; abnormal: PodInfo[] };
  };
}

export interface HistoryResponse {
  history: AnalysisResult[];
  total: number;
}

export interface AskResponse {
  question: string;
  answer: string;
  timestamp: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${AIOPS_API_URL}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const getStatus = () => request<AnalysisResult>('/status');
export const getHistory = (limit = 20) => request<HistoryResponse>(`/history?limit=${limit}`);
export const getAlerts = (limit = 20) => request<HistoryResponse>(`/alerts?limit=${limit}`);
export const getMetrics = (service = '') => request<any>(`/metrics${service ? `?service=${service}` : ''}`);
export const getLogs = (service = '', level = 'error') => request<any>(`/logs${service ? `?service=${service}&level=${level}` : `?level=${level}`}`);
export const getTraces = (service = '') => request<any>(`/traces${service ? `?service=${service}` : ''}`);
export const ask = (question: string) =>
  request<AskResponse>('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
