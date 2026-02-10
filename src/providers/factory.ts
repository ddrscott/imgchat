/**
 * Provider factory - creates appropriate provider based on model
 */

import type { ImageProvider, ProviderContext } from './types';
import { getModelMetadata } from './registry';
import { CloudflareProvider } from './cloudflare';
import { RadioProvider } from './radio';

// Singleton instances
const cloudflareProvider = new CloudflareProvider();
const radioProvider = new RadioProvider();

const providers: ImageProvider[] = [cloudflareProvider, radioProvider];

/**
 * Get the appropriate provider for a model
 */
export function getProviderForModel(modelId: string): ImageProvider | undefined {
  return providers.find((p) => p.supportsModel(modelId));
}

/**
 * Check if a model requires an API key (Radio models do, CF models don't)
 */
export function modelRequiresApiKey(modelId: string): boolean {
  const meta = getModelMetadata(modelId);
  return meta?.provider === 'radio';
}

/**
 * Create provider context from environment
 */
export function createProviderContext(
  apiKey?: string | null,
  ai?: Ai
): ProviderContext {
  return {
    apiKey: apiKey || undefined,
    ai,
  };
}

export { cloudflareProvider, radioProvider };
