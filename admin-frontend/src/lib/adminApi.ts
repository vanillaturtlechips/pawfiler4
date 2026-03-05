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
export async function listQuestions(page = 1, pageSize = 20): Promise<ListQuestionsResponse> {
  const response = await fetch(`${ADMIN_API_URL}/admin/quiz/questions?page=${page}&page_size=${pageSize}`);
  if (!response.ok) {
    throw new Error('Failed to fetch questions');
  }
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
