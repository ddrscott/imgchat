/**
 * Model registry - all supported image generation models
 */

import type { ModelMetadata } from './types';

export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  // Radio TTS models
  'flux2klein': {
    id: 'flux2klein',
    name: 'Flux Klein 4B',
    provider: 'radio',
    providerIcon: 'radio',
    capabilities: {
      supportsEditing: true,
      maxWidth: 2048,
      maxHeight: 2048,
    },
  },
  'flux2klein-9b': {
    id: 'flux2klein-9b',
    name: 'Flux Klein 9B',
    provider: 'radio',
    providerIcon: 'radio',
    capabilities: {
      supportsEditing: true,
      maxWidth: 2048,
      maxHeight: 2048,
    },
  },
  'zimage-turbo': {
    id: 'zimage-turbo',
    name: 'ZImage Turbo',
    provider: 'radio',
    providerIcon: 'radio',
    capabilities: {
      supportsEditing: true,
      maxWidth: 2048,
      maxHeight: 2048,
    },
  },

  // Cloudflare Workers AI models
  'cf-flux-klein-4b': {
    id: 'cf-flux-klein-4b',
    name: 'CF Flux Klein 4B',
    provider: 'cloudflare',
    providerIcon: 'cloud',
    cfModelId: '@cf/black-forest-labs/flux-2-klein-4b',
    capabilities: {
      supportsEditing: true,
      maxWidth: 1024,
      maxHeight: 1024,
    },
  },
  'cf-flux-klein-9b': {
    id: 'cf-flux-klein-9b',
    name: 'CF Flux Klein 9B',
    provider: 'cloudflare',
    providerIcon: 'cloud',
    cfModelId: '@cf/black-forest-labs/flux-2-klein-9b',
    capabilities: {
      supportsEditing: true,
      maxWidth: 1024,
      maxHeight: 1024,
    },
  },
  'cf-flux-dev': {
    id: 'cf-flux-dev',
    name: 'CF Flux Dev',
    provider: 'cloudflare',
    providerIcon: 'cloud',
    cfModelId: '@cf/black-forest-labs/flux-2-dev',
    capabilities: {
      supportsEditing: true,
      maxWidth: 1024,
      maxHeight: 1024,
    },
  },
};

export const ALL_MODELS = Object.values(MODEL_REGISTRY);

export const RADIO_MODELS = ALL_MODELS.filter((m) => m.provider === 'radio');
export const CLOUDFLARE_MODELS = ALL_MODELS.filter((m) => m.provider === 'cloudflare');

export function getModelMetadata(modelId: string): ModelMetadata | undefined {
  return MODEL_REGISTRY[modelId];
}

export function getProviderForModel(modelId: string): 'cloudflare' | 'radio' | undefined {
  return MODEL_REGISTRY[modelId]?.provider;
}

export type ModelId = keyof typeof MODEL_REGISTRY;
