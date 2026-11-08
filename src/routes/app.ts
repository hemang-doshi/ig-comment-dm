/**
 * Serves the dashboard app's HTML shell at /a/<secret>/app (and every
 * client-side route under it). The shell itself holds no data: the app reads
 * everything from /a/<secret>/api, which checks the session. Someone who isn't
 * logged in is sent to the existing login page first.
 *
 * The built files (web/dist) are Workers static assets under /app-static/.
 * They contain no secrets, so serving them without the path secret is fine.
 */
import { Hono } from 'hono';
import { timingSafeEqualString } from '../crypto.ts';
import { readSession, readSessionBinding } from '../session.ts';
import type { Env } from '../types.ts';

export const APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  // Reel thumbnails come straight from Instagram's CDN.
  "img-src 'self' data: https://*.cdninstagram.com https://*.fbcdn.net",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export const appRoutes = new Hono<{ Bindings: Env }>({ strict: false });

appRoutes.get('*', async (c) => {
  const secret = new URL(c.req.url).pathname.split('/')[2] ?? '';
  if (!timingSafeEqualString(secret, c.env.ADMIN_URL_SECRET ?? '')) return c.notFound();
  const { binding, hasPassword } = await readSessionBinding(c.env.DB);
  const session = await readSession(c.env.SESSION_SIGNING_KEY, binding, c.req.header('Cookie'));
  if (!hasPassword || !session?.authed) return c.redirect(`/a/${secret}/login?next=app`, 302);
  if (!c.env.ASSETS) return c.text('The dashboard isn’t built into this deployment yet. Run npm run build:web, then deploy.', 503);
  const res = await c.env.ASSETS.fetch(new Request(new URL('/app-static/index.html', c.req.url)));
  if (!res.ok) return c.text('The dashboard files are missing from this deployment.', 503);
  // The shell's links (manifest, icons) need the admin base, which only the
  // server knows; it's written in here rather than baked into the build.
  const htmlText = (await res.text()).replaceAll('%ADMIN_BASE%', `/a/${secret}`);
  c.header('Content-Security-Policy', APP_CSP);
  return c.html(htmlText);
});
