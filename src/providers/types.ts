/**
 * Provider abstraction types for image generation
 */

export type ProviderType = 'cloudflare' | 'radio';

export interface ModelCapabilities {
  supportsEditing: boolean;
  maxWidth: number;
  maxHeight: number;
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: ProviderType;
  providerIcon: 'cloud' | 'radio';
  cfModelId?: string; // Cloudflare model identifier
  capabilities: ModelCapabilities;
}

export interface GenerationRequest {
  prompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  negativePrompt?: string;
  images?: string[]; // Base64 encoded images for editing
}

export interface GenerationResponse {
  success: boolean;
  imageBase64?: string;
  xUrl?: string | null; // Radio API returns this for image editing
  error?: string;
}

export interface ProviderContext {
  apiKey?: string;
  ai?: Ai; // Cloudflare Workers AI binding
}

export interface ImageProvider {
  readonly providerType: ProviderType;
  generate(request: GenerationRequest, context: ProviderContext): Promise<GenerationResponse>;
  supportsModel(modelId: string): boolean;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GenerationJob {
  id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  status: JobStatus;
  model: string;
  provider: ProviderType;
  prompt: string;
  params: string; // JSON string of GenerationParams
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface GenerationParams {
  width: number;
  height: number;
  steps: number;
  guidance: number;
  negativePrompt?: string;
  images?: string[];
}
