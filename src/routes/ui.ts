import { Hono } from 'hono';
import type { Env } from '../types/env';
import { Layout } from '../templates/Layout';

export const uiRoutes = new Hono<{ Bindings: Env }>();

/**
 * Serve the SPA shell for all UI routes
 */
uiRoutes.get('*', async (c) => {
  const html = Layout();
  return c.html(html);
});
