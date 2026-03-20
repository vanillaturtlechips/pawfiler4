// Admin API Client
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:8082';

export interface Question {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'region_select' | 'comparison';
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_emoji: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  explanation: string;
  options?: string[];
  correct_index?: number;
  correct_answer?: boolean;
  correct_regions?: Array<{ x: number; y: number; radius: number }>;
  tolerance?: number;
  comparison_media_url?: string;
  correct_side?: 'left' | 'right';
}

export interface CreateQuestionRequest {
  type: string;
  media_type: string;
  media_url: string;
  thumbnail_emoji: string;
  difficulty: string;
  category: string;
  explanation: string;
  options?: string[];
  correct_index?: number;
  correct_answer?: boolean;
  correct_regions?: Array<{ x: number; y: number; radius: number }>;
  tolerance?: number;
  comparison_media_url?: string;
  correct_side?: string;
}

export interface ListQuestionsResponse {
  questions: Question[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadMediaResponse {
  url: string;
}

// List questions
export async function listQuestions(page = 1, pageSize = 20, filters?: {
  type?: string; difficulty?: string; category?: string; search?: string;
}): Promise<ListQuestionsResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (filters?.type) params.set('type', filters.type);
  if (filters?.difficulty) params.set('difficulty', filters.difficulty);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions?${params}`);
  if (!response.ok) throw new Error('Failed to fetch questions');
  return response.json();
}

// Get question by ID
export async function getQuestion(id: string): Promise<Question> {
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch question');
  }
  return response.json();
}

// Create question
export async function createQuestion(data: CreateQuestionRequest): Promise<Question> {
  console.log('Creating question with data:', JSON.stringify(data, null, 2));
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create question');
  }
  return response.json();
}

// Update question
export async function updateQuestion(id: string, data: CreateQuestionRequest): Promise<Question> {
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update question');
  }
  return response.json();
}

// Delete question
export async function deleteQuestion(id: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete question');
  }
}

// ── Shop Items ──────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  badge: string;
  type: string;
  quantity: number;
  bonus: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ShopItemRequest {
  name: string;
  description: string;
  price: number;
  icon: string;
  badge: string;
  type: string;
  quantity: number;
  bonus: number;
  is_active: boolean;
  sort_order: number;
}

export async function listShopItems(): Promise<ShopItem[]> {
  const response = await fetch(`${ADMIN_API_URL}/admin/shop/items`);
  if (!response.ok) throw new Error('Failed to fetch shop items');
  const data = await response.json();
  return data.items ?? data;
}

export async function createShopItem(data: ShopItemRequest): Promise<ShopItem> {
  const response = await fetch(`${ADMIN_API_URL}/admin/shop/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create shop item');
  }
  return response.json();
}

export async function updateShopItem(id: string, data: ShopItemRequest): Promise<ShopItem> {
  const response = await fetch(`${ADMIN_API_URL}/admin/shop/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update shop item');
  }
  return response.json();
}

export async function deleteShopItem(id: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_URL}/admin/shop/items/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete shop item');
  }
}

export async function uploadShopImage(file: File): Promise<UploadMediaResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', 'shop');
  formData.append('media_type', 'image');
  formData.append('difficulty', 'easy');

  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload image');
  }
  return response.json();
}

// Upload media
export async function uploadMedia(
  file: File,
  category: string,
  mediaType: 'image' | 'video',
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<UploadMediaResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  formData.append('media_type', mediaType);
  formData.append('difficulty', difficulty);

  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload media');
  }
  return response.json();
}
