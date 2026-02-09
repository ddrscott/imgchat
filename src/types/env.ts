export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

export interface SessionSettings {
  model: 'flux2klein' | 'flux2klein-9b' | 'zimage-turbo';
  width: number;
  height: number;
  steps: number;
  guidance: number;
  negative_prompt: string;
}

export interface Session {
  id: string;
  user_id: string;
  name: string;
  settings: string; // JSON string of SessionSettings
  current_x_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  prompt: string;
  image_path: string | null;
  x_url: string | null;
  is_edit: number; // 0 or 1
  generation_time_ms: number | null;
  created_at: string;
}

export interface AuthUser {
  email: string;
  userId: string;
}

export const DEFAULT_SETTINGS: SessionSettings = {
  model: 'flux2klein',
  width: 1024,
  height: 1024,
  steps: 4,
  guidance: 1.0,
  negative_prompt: '',
};
