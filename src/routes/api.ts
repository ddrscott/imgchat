import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, Session, Message, AuthUser } from '../types/env';
import { requireAuth } from '../middleware/auth';
import {
  getProviderForModel,
  modelRequiresApiKey,
  createProviderContext,
  getModelMetadata,
  MODEL_REGISTRY,
  type GenerationParams,
} from '../providers';
import {
  createJob,
  updateJobStatus,
  markJobProcessing,
  getJob,
  getSessionPendingJobs,
  deleteJob,
} from '../services/job-queue';

export const apiRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Require auth for all API routes
apiRoutes.use('*', requireAuth);

/**
 * GET /api/me - Get current user info
 */
apiRoutes.get('/me', async (c) => {
  const user = c.get('user');
  return c.json({ email: user.email });
});

/**
 * GET /api/sessions - List user's sessions
 */
apiRoutes.get('/sessions', async (c) => {
  const user = c.get('user');

  const sessions = await c.env.DB.prepare(`
    SELECT id, name, settings, current_x_url, archived, created_at, updated_at
    FROM sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 50
  `).bind(user.userId).all<Session>();

  return c.json(sessions.results);
});

/**
 * POST /api/sessions - Create new session
 */
apiRoutes.post('/sessions', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; settings?: object }>().catch(() => ({}));

  const id = nanoid();
  const name = typeof body.name === 'string' ? body.name : 'Untitled';
  const settings = JSON.stringify(body.settings || {});
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO sessions (id, user_id, name, settings, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, user.userId, name, settings, now, now).run();

  return c.json({ id, name, settings, current_x_url: null, created_at: now, updated_at: now }, 201);
});

/**
 * GET /api/sessions/:id - Get session with messages
 */
apiRoutes.get('/sessions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const session = await c.env.DB.prepare(`
    SELECT id, name, settings, current_x_url, archived, created_at, updated_at
    FROM sessions
    WHERE id = ? AND user_id = ?
  `).bind(id, user.userId).first<Session>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = await c.env.DB.prepare(`
    SELECT id, prompt, image_path, x_url, is_edit, generation_time_ms, archived, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).bind(id).all<Message>();

  return c.json({ ...session, messages: messages.results });
});

/**
 * PUT /api/sessions/:id - Update session
 */
apiRoutes.put('/sessions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; settings?: object; current_x_url?: string | null; archived?: boolean }>();

  // Verify ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(id, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const updates: string[] = [];
  const values: (string | null | number)[] = [];

  if (typeof body.name === 'string') {
    updates.push('name = ?');
    values.push(body.name);
  }
  if (body.settings !== undefined) {
    updates.push('settings = ?');
    values.push(JSON.stringify(body.settings));
  }
  if (typeof body.current_x_url === 'string' || body.current_x_url === null) {
    updates.push('current_x_url = ?');
    values.push(body.current_x_url);
  }
  if (typeof body.archived === 'boolean') {
    updates.push('archived = ?');
    values.push(body.archived ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await c.env.DB.prepare(`
      UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();
  }

  return c.json({ success: true });
});

/**
 * DELETE /api/sessions/:id - Delete session and its messages/images
 */
apiRoutes.delete('/sessions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(id, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Get all message image paths to delete from R2
  const messages = await c.env.DB.prepare(`
    SELECT image_path FROM messages WHERE session_id = ? AND image_path IS NOT NULL
  `).bind(id).all<{ image_path: string }>();

  // Delete images from R2
  for (const msg of messages.results) {
    try {
      await c.env.IMAGES.delete(msg.image_path);
    } catch (e) {
      console.error('Failed to delete R2 object:', msg.image_path, e);
    }
  }

  // Delete session (messages cascade)
  await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

/**
 * POST /api/sessions/:id/messages - Create message with image upload
 * Body: { prompt, imageBase64, xUrl, isEdit, generationTimeMs }
 */
apiRoutes.post('/sessions/:id/messages', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json<{
    prompt: string;
    imageBase64: string;
    xUrl: string | null;
    isEdit: boolean;
    generationTimeMs: number;
  }>();

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messageId = nanoid();
  const imagePath = `images/${sessionId}/${messageId}.png`;
  const now = new Date().toISOString();

  // Decode base64 and upload to R2
  const imageData = Uint8Array.from(atob(body.imageBase64), c => c.charCodeAt(0));
  await c.env.IMAGES.put(imagePath, imageData, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
  });

  // Insert message
  await c.env.DB.prepare(`
    INSERT INTO messages (id, session_id, prompt, image_path, x_url, is_edit, generation_time_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    messageId,
    sessionId,
    body.prompt,
    imagePath,
    body.xUrl,
    body.isEdit ? 1 : 0,
    body.generationTimeMs,
    now
  ).run();

  // Update session's current_x_url
  await c.env.DB.prepare(`
    UPDATE sessions SET current_x_url = ?, updated_at = ? WHERE id = ?
  `).bind(body.xUrl, now, sessionId).run();

  return c.json({
    id: messageId,
    prompt: body.prompt,
    image_path: imagePath,
    x_url: body.xUrl,
    is_edit: body.isEdit ? 1 : 0,
    generation_time_ms: body.generationTimeMs,
    archived: 0,
    created_at: now,
  }, 201);
});

/**
 * POST /api/sessions/:id/upload - Upload user image
 * Body: { imageBase64: string, filename?: string }
 * Max size: 10MB, Formats: png, jpg, webp
 */
apiRoutes.post('/sessions/:id/upload', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json<{
    imageBase64: string;
    filename?: string;
  }>();

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Validate base64 image
  if (!body.imageBase64) {
    return c.json({ error: 'No image provided' }, 400);
  }

  // Check size (base64 is ~33% larger than binary, so 13.3MB base64 ≈ 10MB binary)
  if (body.imageBase64.length > 13_300_000) {
    return c.json({ error: 'Image too large (max 10MB)' }, 400);
  }

  const messageId = nanoid();
  const imagePath = `images/${sessionId}/${messageId}.png`;
  const now = new Date().toISOString();

  try {
    // Decode base64 and upload to R2
    const imageData = Uint8Array.from(atob(body.imageBase64), ch => ch.charCodeAt(0));
    await c.env.IMAGES.put(imagePath, imageData, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Insert message with special prompt for uploads
    const prompt = body.filename ? `[Uploaded: ${body.filename}]` : '[Uploaded image]';
    await c.env.DB.prepare(`
      INSERT INTO messages (id, session_id, prompt, image_path, x_url, is_edit, generation_time_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      sessionId,
      prompt,
      imagePath,
      null, // No x_url for uploads
      0,    // Not an edit
      null, // No generation time
      now
    ).run();

    return c.json({
      id: messageId,
      prompt,
      image_path: imagePath,
      x_url: null,
      is_edit: 0,
      generation_time_ms: null,
      archived: 0,
      created_at: now,
    }, 201);
  } catch (e) {
    console.error('[Upload] Error:', e);
    return c.json({ error: 'Failed to upload image' }, 500);
  }
});

/**
 * PUT /api/sessions/:id/messages/:msgId - Update message (archive/unarchive)
 */
apiRoutes.put('/sessions/:id/messages/:msgId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const msgId = c.req.param('msgId');
  const body = await c.req.json<{ archived?: boolean }>();

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Verify message belongs to session
  const message = await c.env.DB.prepare(`
    SELECT id FROM messages WHERE id = ? AND session_id = ?
  `).bind(msgId, sessionId).first();

  if (!message) {
    return c.json({ error: 'Message not found' }, 404);
  }

  if (body.archived !== undefined) {
    await c.env.DB.prepare(`
      UPDATE messages SET archived = ? WHERE id = ?
    `).bind(body.archived ? 1 : 0, msgId).run();
  }

  return c.json({ success: true });
});

/**
 * DELETE /api/sessions/:id/messages/:msgId - Delete a message and its image
 */
apiRoutes.delete('/sessions/:id/messages/:msgId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const msgId = c.req.param('msgId');

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Get message to delete its image
  const message = await c.env.DB.prepare(`
    SELECT id, image_path FROM messages WHERE id = ? AND session_id = ?
  `).bind(msgId, sessionId).first<{ id: string; image_path: string | null }>();

  if (!message) {
    return c.json({ error: 'Message not found' }, 404);
  }

  // Delete image from R2 if exists
  if (message.image_path) {
    try {
      await c.env.IMAGES.delete(message.image_path);
    } catch (e) {
      console.error('Failed to delete R2 object:', message.image_path, e);
    }
  }

  // Delete message from database
  await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(msgId).run();

  return c.json({ success: true });
});

// User preferences types
interface UserPreferences {
  user_id: string;
  api_key: string | null;
  default_model: string;
  default_width: number;
  default_height: number;
  default_steps: number;
  default_guidance: number;
  negative_prompt: string;
}

/**
 * GET /api/preferences - Get user preferences
 */
apiRoutes.get('/preferences', async (c) => {
  const user = c.get('user');

  const prefs = await c.env.DB.prepare(`
    SELECT api_key, default_model, default_width, default_height,
           default_steps, default_guidance, negative_prompt
    FROM user_preferences
    WHERE user_id = ?
  `).bind(user.userId).first<UserPreferences>();

  if (!prefs) {
    // Return defaults if no preferences saved
    return c.json({
      hasApiKey: false,
      model: 'cf-flux-klein-4b',
      width: 1024,
      height: 1024,
      steps: 4,
      guidance: 1.0,
      negativePrompt: '',
    });
  }

  return c.json({
    hasApiKey: !!prefs.api_key,
    model: prefs.default_model,
    width: prefs.default_width,
    height: prefs.default_height,
    steps: prefs.default_steps,
    guidance: prefs.default_guidance,
    negativePrompt: prefs.negative_prompt || '',
  });
});

/**
 * PUT /api/preferences - Update user preferences
 */
apiRoutes.put('/preferences', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    apiKey?: string;
    model?: string;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
    negativePrompt?: string;
  }>();

  const now = new Date().toISOString();

  // Check if preferences exist
  const existing = await c.env.DB.prepare(`
    SELECT user_id FROM user_preferences WHERE user_id = ?
  `).bind(user.userId).first();

  if (!existing) {
    // Insert new preferences
    await c.env.DB.prepare(`
      INSERT INTO user_preferences (user_id, api_key, default_model, default_width,
        default_height, default_steps, default_guidance, negative_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.userId,
      body.apiKey || null,
      body.model || 'cf-flux-klein-4b',
      body.width || 1024,
      body.height || 1024,
      body.steps || 4,
      body.guidance || 1.0,
      body.negativePrompt || '',
      now,
      now
    ).run();
  } else {
    // Update existing preferences
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.apiKey !== undefined) {
      updates.push('api_key = ?');
      values.push(body.apiKey || null);
    }
    if (body.model !== undefined) {
      updates.push('default_model = ?');
      values.push(body.model);
    }
    if (body.width !== undefined) {
      updates.push('default_width = ?');
      values.push(body.width);
    }
    if (body.height !== undefined) {
      updates.push('default_height = ?');
      values.push(body.height);
    }
    if (body.steps !== undefined) {
      updates.push('default_steps = ?');
      values.push(body.steps);
    }
    if (body.guidance !== undefined) {
      updates.push('default_guidance = ?');
      values.push(body.guidance);
    }
    if (body.negativePrompt !== undefined) {
      updates.push('negative_prompt = ?');
      values.push(body.negativePrompt);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(user.userId);

      await c.env.DB.prepare(`
        UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?
      `).bind(...values).run();
    }
  }

  return c.json({ success: true });
});

/**
 * GET /api/models - Get available models with provider info
 */
apiRoutes.get('/models', async (c) => {
  const models = Object.values(MODEL_REGISTRY).map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    providerIcon: m.providerIcon,
    capabilities: m.capabilities,
  }));
  return c.json(models);
});

/**
 * GET /api/sessions/:id/jobs - Get pending/processing jobs for a session
 * Used for recovering job status on page reload
 */
apiRoutes.get('/sessions/:id/jobs', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const jobs = await getSessionPendingJobs(c.env.DB, sessionId);
  return c.json(jobs);
});

/**
 * GET /api/jobs/:id - Get job status
 * Used for polling job completion
 */
apiRoutes.get('/jobs/:id', async (c) => {
  const user = c.get('user');
  const jobId = c.req.param('id');

  const job = await getJob(c.env.DB, jobId);
  if (!job || job.user_id !== user.userId) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // If job is completed, return the message data too
  if (job.status === 'completed') {
    const message = await c.env.DB.prepare(`
      SELECT id, prompt, image_path, x_url, is_edit, generation_time_ms, archived, created_at
      FROM messages WHERE id = ?
    `).bind(job.message_id).first<Message>();

    return c.json({ job, message });
  }

  return c.json({ job });
});

/**
 * POST /api/sessions/:id/generate - Server-side image generation
 * Creates job, starts generation asynchronously, returns job for polling
 */
apiRoutes.post('/sessions/:id/generate', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json<{
    prompt: string;
    model: string;
    width: number;
    height: number;
    steps: number;
    guidance: number;
    negativePrompt?: string;
    images?: string[]; // image_paths for editing (fetched from R2 and converted to base64)
  }>();

  // Verify session ownership
  const session = await c.env.DB.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.userId).first();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Get model metadata
  const modelMeta = getModelMetadata(body.model);
  if (!modelMeta) {
    return c.json({ error: `Unknown model: ${body.model}` }, 400);
  }

  // Get provider for this model
  const provider = getProviderForModel(body.model);
  if (!provider) {
    return c.json({ error: `No provider for model: ${body.model}` }, 400);
  }

  // Check API key requirement for Radio models
  let apiKey: string | null = null;
  if (modelRequiresApiKey(body.model)) {
    const prefs = await c.env.DB.prepare(`
      SELECT api_key FROM user_preferences WHERE user_id = ?
    `).bind(user.userId).first<{ api_key: string | null }>();

    if (!prefs?.api_key) {
      return c.json({ error: 'API key required for Radio models. Go to Settings.' }, 400);
    }
    apiKey = prefs.api_key;
  }

  const isEdit = body.images && body.images.length > 0;
  const messageId = nanoid();
  const now = new Date().toISOString();

  // Create generation params
  const params: GenerationParams = {
    width: body.width,
    height: body.height,
    steps: body.steps,
    guidance: body.guidance,
    negativePrompt: body.negativePrompt,
    images: body.images,
  };

  // Create job for persistence (allows recovery on page refresh)
  const job = await createJob(c.env.DB, {
    sessionId,
    messageId,
    userId: user.userId,
    model: body.model,
    provider: modelMeta.provider,
    prompt: body.prompt,
    params,
  });

  // Create provider context
  const context = createProviderContext(apiKey, c.env.AI);

  // Run generation in background with waitUntil
  const generationPromise = (async () => {
    try {
      console.log('[Generation] Starting job:', messageId, 'model:', body.model);
      await markJobProcessing(c.env.DB, messageId);
      const startTime = Date.now();

      // For editing: convert image paths to base64 (images are stored in R2)
      let imagesToUse = body.images;
      if (isEdit && body.images && body.images.length > 0) {
        console.log('[Generation] Fetching images from R2 for editing...');
        const base64Images: string[] = [];
        for (const imgPath of body.images) {
          // imgPath is like "images/sessionId/messageId.png"
          const r2Object = await c.env.IMAGES.get(imgPath);
          if (r2Object) {
            const arrayBuffer = await r2Object.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            // Convert to base64 in chunks to avoid stack overflow
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, i + chunkSize);
              binary += String.fromCharCode(...chunk);
            }
            base64Images.push(btoa(binary));
          }
        }
        imagesToUse = base64Images;
        console.log('[Generation] Converted', base64Images.length, 'images to base64');
      }

      console.log('[Generation] Calling provider.generate...');
      // Generate image
      const result = await provider.generate(
        {
          prompt: body.prompt,
          model: body.model,
          width: body.width,
          height: body.height,
          steps: body.steps,
          guidance: body.guidance,
          negativePrompt: body.negativePrompt,
          images: imagesToUse,
        },
        context
      );

      console.log('[Generation] Provider returned:', result.success, result.error);
      if (!result.success || !result.imageBase64) {
        console.log('[Generation] Failed:', result.error);
        await updateJobStatus(c.env.DB, messageId, 'failed', result.error || 'Generation failed');
        return;
      }

      const generationTimeMs = Date.now() - startTime;

      // Decode base64 and save to R2
      const binaryString = atob(result.imageBase64);
      const imageData = Uint8Array.from(binaryString, (ch) => ch.charCodeAt(0));
      const imagePath = `images/${sessionId}/${messageId}.png`;

      await c.env.IMAGES.put(imagePath, imageData, {
        httpMetadata: {
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Insert message
      const xUrl = result.xUrl || null;
      await c.env.DB.prepare(`
        INSERT INTO messages (id, session_id, prompt, image_path, x_url, is_edit, generation_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(messageId, sessionId, body.prompt, imagePath, xUrl, isEdit ? 1 : 0, generationTimeMs, now).run();

      // Update session's current_x_url
      await c.env.DB.prepare(`
        UPDATE sessions SET current_x_url = ?, updated_at = ? WHERE id = ?
      `).bind(xUrl, now, sessionId).run();

      // Mark job completed first (don't block on title generation)
      await updateJobStatus(c.env.DB, messageId, 'completed');

      // Auto-generate session title on first message (fire-and-forget)
      (async () => {
        try {
          const messageCount = await c.env.DB.prepare(
            'SELECT COUNT(*) as count FROM messages WHERE session_id = ?'
          ).bind(sessionId).first<{ count: number }>();

          const currentSession = await c.env.DB.prepare(
            'SELECT name FROM sessions WHERE id = ?'
          ).bind(sessionId).first<{ name: string }>();

          if (messageCount?.count === 1 &&
              (currentSession?.name === 'Untitled' || currentSession?.name === 'New Chat')) {
            console.log('[Title] Generating title for first message...');

            // Generate title using smallest/fastest CF text model
            const titleResponse = await c.env.AI.run(
              '@cf/meta/llama-3.2-1b-instruct',
              {
                messages: [
                  {
                    role: 'user',
                    content: `Summarize this image description into a short title (3-5 words): ${body.prompt}`
                  }
                ],
                max_tokens: 50
              }
            ) as { response?: string };

            if (titleResponse?.response) {
              // Strip quotes and clean up the title
              const title = titleResponse.response
                .trim()
                .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
                .trim()
                .slice(0, 50);
              console.log('[Title] Generated:', title);
              await c.env.DB.prepare(
                'UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?'
              ).bind(title, new Date().toISOString(), sessionId).run();
            }
          }
        } catch (titleError) {
          // Non-critical - log but don't fail
          console.error('[Title] Error:', titleError);
        }
      })();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Generation failed';
      await updateJobStatus(c.env.DB, messageId, 'failed', errorMsg);
    }
  })();

  // Use waitUntil to run generation in background
  c.executionCtx.waitUntil(generationPromise);

  // Return job immediately for client polling
  return c.json(
    {
      job: {
        id: messageId,
        status: 'pending',
        model: body.model,
        provider: modelMeta.provider,
        prompt: body.prompt,
      },
      message: {
        id: messageId,
        session_id: sessionId,
        prompt: body.prompt,
        image_path: null,
        x_url: null,
        is_edit: isEdit ? 1 : 0,
        generation_time_ms: null,
        archived: 0,
        created_at: now,
      },
    },
    202
  );
});
