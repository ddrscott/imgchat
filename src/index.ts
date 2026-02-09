import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { setCookie } from 'hono/cookie';
import type { Env } from './types/env';
import { apiRoutes } from './routes/api';
import { uiRoutes } from './routes/ui';
import { verifySessionToken } from './middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// Logging
app.use('*', logger());

// CORS for API routes
app.use('/api/*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth callback for cross-domain authentication from justright.fm
// This endpoint receives a session token and sets a local cookie
app.get('/api/auth/callback', async (c) => {
  const token = c.req.query('token');
  const returnTo = c.req.query('returnTo') || '/';

  if (!token) {
    return c.json({ error: 'Missing token' }, 400);
  }

  // Verify the token is valid (signed by justright.fm with same JWT_SECRET)
  const jwtSecret = c.env.JWT_SECRET || 'dev-secret-change-me';
  const session = await verifySessionToken(token, jwtSecret);

  if (!session) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Set local session cookie
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  // Redirect to the final destination
  return c.redirect(returnTo);
});

// Serve images from R2
app.get('/images/:sessionId/:messageId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const messageId = c.req.param('messageId');
  const key = `images/${sessionId}/${messageId}`;

  const object = await c.env.IMAGES.get(key);

  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000');

  return new Response(object.body, { headers });
});

// API routes (authenticated)
app.route('/api', apiRoutes);

// UI routes (SPA shell)
app.route('/', uiRoutes);

export default app;
