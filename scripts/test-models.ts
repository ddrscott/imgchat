/**
 * Test script to compare Cloudflare Workers AI flux-2 image models
 * Run with: cd scripts && wrangler dev --remote
 * Then visit: http://localhost:8787
 */

interface Env {
  AI: Ai;
}

const MODELS = [
  '@cf/black-forest-labs/flux-2-klein-4b',
  '@cf/black-forest-labs/flux-2-klein-9b',
  '@cf/black-forest-labs/flux-2-dev',
] as const;

const PROMPT = `A weathered lighthouse keeper in his 60s with a salt-and-pepper beard, standing at the top of a spiral staircase inside an old Victorian lighthouse at golden hour. Dust particles float in the warm light streaming through the windows. He holds an antique brass telescope and wears a worn navy peacoat. The walls are covered with maritime maps and faded photographs. Photorealistic, cinematic lighting, 8k detail, shallow depth of field.`;

interface TestResult {
  model: string;
  time: number;
  success: boolean;
  error?: string;
  imageSize?: number;
}

async function createMultipartInput(prompt: string, width = 1024, height = 1024) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', width.toString());
  form.append('height', height.toString());

  const formRequest = new Request('http://localhost', {
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

async function runTest(ai: Ai, model: string): Promise<TestResult> {
  const start = Date.now();

  try {
    const input = await createMultipartInput(PROMPT);
    const response = await ai.run(model as BaseAiTextToImageModels, input);

    const time = Date.now() - start;
    const imageSize = response.image ? response.image.length : 0;

    return { model, time, success: true, imageSize };
  } catch (e) {
    const time = Date.now() - start;
    return { model, time, success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Return an image from a specific model
    if (url.pathname.startsWith('/image/')) {
      const modelName = url.pathname.replace('/image/', '');
      const model = MODELS.find(m => m.includes(modelName));

      if (!model) {
        return new Response('Model not found. Try: /image/flux-2-klein-4b, /image/flux-2-klein-9b, /image/flux-2-dev', { status: 404 });
      }

      try {
        const start = Date.now();
        const input = await createMultipartInput(PROMPT);
        const response = await env.AI.run(model as BaseAiTextToImageModels, input);
        const time = Date.now() - start;

        const binaryString = atob(response.image);
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));

        return new Response(bytes, {
          headers: {
            'Content-Type': 'image/png',
            'X-Generation-Time': `${(time / 1000).toFixed(2)}s`,
            'X-Model': model,
          },
        });
      } catch (e) {
        return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
      }
    }

    // Run all models in parallel
    if (url.pathname === '/parallel') {
      console.log('Starting parallel test...');

      const startAll = Date.now();
      const results = await Promise.all(MODELS.map(model => runTest(env.AI, model)));
      const totalTime = Date.now() - startAll;

      const output = {
        prompt: PROMPT,
        parallel: true,
        totalTime: `${(totalTime / 1000).toFixed(2)}s`,
        results: results.map(r => ({
          model: r.model.split('/').pop(),
          time: `${(r.time / 1000).toFixed(2)}s`,
          success: r.success,
          imageSize: r.imageSize ? `${Math.round(r.imageSize / 1024)}KB` : undefined,
          error: r.error,
        })),
      };

      return new Response(JSON.stringify(output, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Run models sequentially (default)
    console.log('Starting sequential test...');

    const results: TestResult[] = [];
    const startAll = Date.now();

    for (const model of MODELS) {
      const shortName = model.split('/').pop();
      console.log(`Testing ${shortName}...`);
      const result = await runTest(env.AI, model);
      results.push(result);
      console.log(`  ${result.success ? '✓' : '✗'} ${(result.time / 1000).toFixed(2)}s`);
    }

    const totalTime = Date.now() - startAll;

    const output = {
      prompt: PROMPT,
      parallel: false,
      totalTime: `${(totalTime / 1000).toFixed(2)}s`,
      results: results.map(r => ({
        model: r.model.split('/').pop(),
        time: `${(r.time / 1000).toFixed(2)}s`,
        success: r.success,
        imageSize: r.imageSize ? `${Math.round(r.imageSize / 1024)}KB` : undefined,
        error: r.error,
      })),
    };

    return new Response(JSON.stringify(output, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
