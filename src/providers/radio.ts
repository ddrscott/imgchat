/**
 * Radio TTS API image generation provider
 */

import type {
  ImageProvider,
  GenerationRequest,
  GenerationResponse,
  ProviderContext,
  ProviderType,
} from './types';

const RADIO_MODELS = ['flux2klein', 'flux2klein-9b', 'zimage-turbo'];
const TTS_API_URL = 'https://tts.justright.fm';

/**
 * Upload base64 image to Radio's upload endpoint to get a URL
 */
async function uploadImageToRadio(base64: string, apiKey: string): Promise<string> {
  // Convert base64 to binary
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });

  // Create multipart form data
  const form = new FormData();
  form.append('file', blob, 'image.png');

  const response = await fetch(`${TTS_API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as { url?: string };
  if (!result.url) {
    throw new Error('Upload did not return a URL');
  }

  return result.url;
}

export class RadioProvider implements ImageProvider {
  readonly providerType: ProviderType = 'radio';

  supportsModel(modelId: string): boolean {
    return RADIO_MODELS.includes(modelId);
  }

  async generate(request: GenerationRequest, context: ProviderContext): Promise<GenerationResponse> {
    if (!context.apiKey) {
      return {
        success: false,
        error: 'API key not configured. Go to Settings.',
      };
    }

    const isEdit = request.images && request.images.length > 0;

    // Build TTS API payload
    const payload: Record<string, unknown> = {
      prompt: request.prompt,
      model: isEdit ? (request.model?.startsWith('flux') ? request.model : 'flux2klein') : request.model,
      width: request.width,
      height: request.height,
      num_inference_steps: request.steps,
      guidance_scale: request.guidance,
    };

    if (request.negativePrompt) {
      payload.negative_prompt = request.negativePrompt;
    }

    if (isEdit && request.images) {
      // Upload base64 images to Radio to get URLs
      const imageUrls: string[] = [];
      for (const img of request.images) {
        // If it's already a URL, use it directly
        if (img.startsWith('http')) {
          imageUrls.push(img);
        } else {
          // Strip data URL prefix if present, then upload to get a URL
          const base64Data = img.startsWith('data:')
            ? img.split(',')[1]
            : img;
          const url = await uploadImageToRadio(base64Data, context.apiKey);
          imageUrls.push(url);
        }
      }
      payload.images = imageUrls;
    }

    try {
      const response = await fetch(`${TTS_API_URL}/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `API error: ${response.status} - ${errorText}`,
        };
      }

      const imageData = await response.arrayBuffer();
      // Convert to base64 in chunks to avoid stack overflow
      const bytes = new Uint8Array(imageData);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      const xUrl = response.headers.get('X-Url');

      return {
        success: true,
        imageBase64: base64,
        xUrl, // Include for Radio provider since it returns this
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Extended response type for Radio which includes X-Url
export interface RadioGenerationResponse extends GenerationResponse {
  xUrl?: string | null;
}
