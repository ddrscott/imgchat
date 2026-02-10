/**
 * Client-side model definitions with provider info
 */

export type ProviderType = 'cloudflare' | 'radio';
export type ProviderIcon = 'cloud' | 'radio';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  providerIcon: ProviderIcon;
  requiresApiKey: boolean;
}

// All supported models
export const MODELS: ModelInfo[] = [
  // Radio TTS models (require API key)
  { id: 'flux2klein', name: 'Flux Klein 4B', provider: 'radio', providerIcon: 'radio', requiresApiKey: true },
  { id: 'flux2klein-9b', name: 'Flux Klein 9B', provider: 'radio', providerIcon: 'radio', requiresApiKey: true },
  { id: 'zimage-turbo', name: 'ZImage Turbo', provider: 'radio', providerIcon: 'radio', requiresApiKey: true },
  // Cloudflare Workers AI models (no API key needed)
  { id: 'cf-flux-klein-4b', name: 'CF Flux Klein 4B', provider: 'cloudflare', providerIcon: 'cloud', requiresApiKey: false },
  { id: 'cf-flux-klein-9b', name: 'CF Flux Klein 9B', provider: 'cloudflare', providerIcon: 'cloud', requiresApiKey: false },
  { id: 'cf-flux-dev', name: 'CF Flux Dev', provider: 'cloudflare', providerIcon: 'cloud', requiresApiKey: false },
];

export const MODEL_MAP = new Map(MODELS.map(m => [m.id, m]));

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_MAP.get(modelId);
}

export function modelRequiresApiKey(modelId: string): boolean {
  return MODEL_MAP.get(modelId)?.requiresApiKey ?? true;
}

export type ModelId = typeof MODELS[number]['id'];
