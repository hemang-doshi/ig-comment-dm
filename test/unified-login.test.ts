import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH,
  authorizeUrl,
  configureMeta,
  exchangeCodeForShortLived,
  fetchMe,
  isUnifiedLogin,
  listRecentMedia,
} from '../src/meta.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  configureMeta({});
});

describe('Unified login (META_LOGIN_CONFIG_ID set)', () => {
  it('switches Graph host only when a config id is set', () => {
    configureMeta({});
    expect(isUnifiedLogin()).toBe(false);
    expect(GRAPH).toContain('graph.instagram.com');
    configureMeta({ META_LOGIN_CONFIG_ID: ' 123 ' });
    expect(isUnifiedLogin()).toBe(true);
    expect(GRAPH).toContain('graph.facebook.com');
  });

  it('sends people to the Facebook Login for Business dialog with config_id and no scope', () => {
    configureMeta({ META_LOGIN_CONFIG_ID: 'cfg1' });
    const u = new URL(authorizeUrl({ clientId: 'app1', redirectUri: 'https://x.dev/connect/callback', state: 's', forceReauth: false }));
    expect(u.origin + u.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
    expect(u.searchParams.get('config_id')).toBe('cfg1');
    expect(u.searchParams.get('override_default_response_type')).toBe('true');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.has('scope')).toBe(false);
  });

  it('exchanges the code on graph.facebook.com and reads the assigned Instagram account', async () => {
    configureMeta({ META_LOGIN_CONFIG_ID: 'cfg1' });
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'SUAT' }));
      if (url.includes('/me/assigned_instagram_accounts')) return new Response(JSON.stringify({ data: [{ id: '1784', username: 'hemangbuilds' }] }));
      if (url.includes('/1784/media')) return new Response(JSON.stringify({ data: [{ id: 'm1', caption: 'zelda', permalink: 'https://instagram.com/reel/x', media_product_type: 'REELS' }] }));
      return new Response('{}', { status: 404 });
    });
    const tok = await exchangeCodeForShortLived({ clientId: 'a', clientSecret: 'b', redirectUri: 'r', code: 'c' });
    expect(tok.access_token).toBe('SUAT');
    const me = await fetchMe('SUAT');
    expect(me).toMatchObject({ id: '1784', user_id: '1784', username: 'hemangbuilds' });
    const media = await listRecentMedia('SUAT', undefined, '1784');
    expect(media[0]).toMatchObject({ id: 'm1', kind: 'reel' });
    expect(seen.every((u) => u.startsWith('https://graph.facebook.com/'))).toBe(true);
  });

  it('says what to do when no Instagram account was granted', async () => {
    configureMeta({ META_LOGIN_CONFIG_ID: 'cfg1' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [] })));
    await expect(fetchMe('SUAT')).rejects.toThrow(/No Instagram account was granted/);
  });
});
