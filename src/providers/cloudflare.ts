/**
 * Cloudflare Workers AI image generation provider
 */

import type {
  ImageProvider,
  GenerationRequest,
  GenerationResponse,
  ProviderContext,
  ProviderType,
} from './types';
import { MODEL_REGISTRY } from './registry';

const CLOUDFLARE_MODELS = ['cf-flux-klein-4b', 'cf-flux-klein-9b', 'cf-flux-dev'];

interface MultipartInput {
  multipart: {
    body: ReadableStream<Uint8Array> | null;
    contentType: string;
  };
}

/**
 * Creates multipart form input for Cloudflare Workers AI Flux 2 models
 * CF Flux 2 requires multipart format even for text-to-image
 */
function createMultipartInput(
  prompt: string,
  width: number,
  height: number,
  inputImages?: string[] // Base64 images for editing (up to 4)
): MultipartInput {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', width.toString());
  form.append('height', height.toString());

  // Add input images for editing if provided (up to 4, must be < 512x512)
  if (inputImages && inputImages.length > 0) {
    inputImages.slice(0, 4).forEach((imageBase64, index) => {
      const binaryString = atob(imageBase64);
      const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      form.append(`input_image_${index}`, blob, `input_${index}.png`);
    });
  }

  // Create dummy request to extract the body stream and content-type
  // This is the pattern from CF docs
  const formRequest = new Request('http://dummy', {
    method: 'POST',
    body: form,
  });

  return {
    multipart: {
      body: formRequest.body,
      contentType: formRequest.headers.get('content-type') || 'multipart/form-data',
    },
  };
}

export class CloudflareProvider implements ImageProvider {
  readonly providerType: ProviderType = 'cloudflare';

  supportsModel(modelId: string): boolean {
    return CLOUDFLARE_MODELS.includes(modelId);
  }

  async generate(request: GenerationRequest, context: ProviderContext): Promise<GenerationResponse> {
    console.log('[CF Provider] generate() called');
    if (!context.ai) {
      return {
        success: false,
        error: 'Workers AI binding not available',
      };
    }

    const modelMeta = MODEL_REGISTRY[request.model];
    if (!modelMeta || !modelMeta.cfModelId) {
      return {
        success: false,
        error: `Unknown Cloudflare model: ${request.model}`,
      };
    }

    try {
      console.log('[CF Provider] Model:', modelMeta.cfModelId, 'Edit images:', request.images?.length || 0);

      // CF Flux 2 always requires multipart format
      const input = createMultipartInput(
        request.prompt,
        request.width,
        request.height,
        request.images
      );
      console.log('[CF Provider] Calling AI.run with multipart input...');

      // @ts-expect-error - Cloudflare Workers AI types
      const response = await context.ai.run(modelMeta.cfModelId, input) as { image?: string };
      console.log('[CF Provider] AI.run completed, has image:', !!response?.image);

      if (!response?.image) {
        return {
          success: false,
          error: 'No image returned from Cloudflare AI',
        };
      }

      return {
        success: true,
        imageBase64: response.image,
      };
    } catch (error) {
      console.error('[CF Provider] Error:', error);
      console.error('[CF Provider] Stack:', error instanceof Error ? error.stack : 'no stack');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
