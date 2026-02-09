import { getCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { Env, AuthUser } from '../types/env';

/**
 * Verify a session token (same algorithm as justright.fm)
 * Token format: base64({ data: JSON, sig: hex })
 */
export async function verifySessionToken(token: string, secret: string): Promise<{ email: string } | null> {
  try {
    const decoded = JSON.parse(atob(token));
    const { data, sig } = decoded;
    const payload = JSON.parse(data);

    // Check expiry
    if (payload.exp < Date.now()) {
      return null;
    }

    // Verify HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(sig.match(/.{2}/g).map((byte: string) => parseInt(byte, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));

    if (!valid) {
      return null;
    }

    return { email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Get the current authenticated user from the request
 * Uses email as userId since we can't access justright.fm's users table
 */
export async function getAuthUser(c: Context<{ Bindings: Env }>): Promise<AuthUser | null> {
  const sessionToken = getCookie(c, 'session');

  if (!sessionToken) {
    return null;
  }

  const jwtSecret = c.env.JWT_SECRET || 'dev-secret-change-me';
  const session = await verifySessionToken(sessionToken, jwtSecret);

  if (!session) {
    return null;
  }

  // Use email as the userId (simplified - no cross-DB lookup)
  return {
    email: session.email,
    userId: session.email, // Use email as identifier
  };
}

/**
 * Middleware that requires authentication
 * Sets c.get('user') with the AuthUser if authenticated
 * Returns 401 if not authenticated
 */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  c.set('user', user);
  return next();
}

/**
 * Middleware that optionally sets the user if authenticated
 * Does not block unauthenticated requests
 */
export async function optionalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const user = await getAuthUser(c);

  if (user) {
    c.set('user', user);
  }

  return next();
}
