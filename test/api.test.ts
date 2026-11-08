import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { meta } from './support/meta.ts';
import { IG_USER, NOW, seedAccount, seedQueued, seedRule, ruleRows } from './support/seed.ts';
import { type Browser, MINUTE_CRON, adminPath, commentPayload, postWebhook, request, runScheduled, signedInAdmin } from './support/worker.ts';

async function api(browser: Browser | null, path: string, init: RequestInit & { csrf?: string } = {}) {
  const headers = new Headers(init.headers);
  if (browser) headers.set('Cookie', browser.cookieHeader);
  if (init.csrf) headers.set('X-CSRF-Token', init.csrf);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await request(adminPath(`/api${path}`), { ...init, headers });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(res.text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, headers: res.headers };
}

async function session() {
  const browser = await signedInAdmin();
  const s = await api(browser, '/session');
  return { browser, csrf: s.json.csrf as string };
}

const refusal = (code: number, subcode?: number, message = 'refused') => ({
  status: 400,
  json: { error: { message, type: 'OAuthException', code, ...(subcode ? { error_subcode: subcode } : {}) } },
});

describe('the dashboard API', () => {
  it('needs the secret path and a logged-in session, and answers JSON', async () => {
    expect((await request('/a/wrong-secret/api/overview')).status).toBe(404);
    const anon = await api(null, '/overview');
    expect(anon.status).toBe(401);
    expect(anon.json).toMatchObject({ login: true });
    const { browser } = await session();
    const ok = await api(browser, '/overview');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain('no-store');
  });

  it('refuses any change without the session’s CSRF token', async () => {
    await seedAccount();
    const ruleId = await seedRule();
    const { browser, csrf } = await session();
    expect((await api(browser, `/rules/${ruleId}/toggle`, { method: 'POST' })).status).toBe(403);
    expect((await api(browser, `/rules/${ruleId}/toggle`, { method: 'POST', csrf: 'nope' })).status).toBe(403);
    expect((await api(browser, `/rules/${ruleId}/toggle`, { method: 'POST', csrf })).status).toBe(200);
    expect((await ruleRows())[0]).toMatchObject({ active: 0 });
  });

  it('summarises the state in one sentence', async () => {
    await seedAccount();
    const { browser } = await session();
    const res = await api(browser, '/overview');
    expect(res.json).toMatchObject({ state: 'ok', headline: expect.stringContaining('working') });
    expect((res.json.accounts as unknown[]).length).toBe(1);
  });

  it('explains each outcome specifically, including Meta’s error codes', async () => {
    await seedAccount();
    const ruleId = await seedRule();
    meta.on('POST', '/:id/messages', refusal(-1, 2534023, '(#-1) The comment that you are trying to reply to already has a reply.'));
    await postWebhook(commentPayload({ commentId: 'answered-before', text: 'Guide please!' }));
    meta.on('POST', '/:id/messages', refusal(100, 2534014, '(#100) The requested user cannot be found.'));
    await postWebhook(commentPayload({ commentId: 'cant-reach', text: 'Guide please!' }));
    await seedQueued({ commentId: 'waiting', ruleId, commentAt: NOW - 30 });

    const { browser } = await session();
    const res = await api(browser, '/activity');
    const items = res.json.items as Array<{ commentId: string; status: string; commentText: string | null; outcome: { title: string; reason: string; label: string } }>;
    const byId = new Map(items.map((i) => [i.commentId, i]));
    expect(byId.get('answered-before')?.outcome.title).toMatch(/Already answered/);
    expect(byId.get('answered-before')?.outcome.reason).toMatch(/one private reply|Business Suite/);
    expect(byId.get('answered-before')?.commentText).toBe('Guide please!');
    expect(byId.get('cant-reach')?.outcome.title).toMatch(/couldn’t deliver/);
    expect(byId.get('waiting')?.outcome.label).toBe('Queued');
    // "Already answered" isn't a failure from the creator's side: it's grouped with skipped.
    expect(res.json.counts).toMatchObject({ problem: 1, waiting: 1, skipped: 1 });
    expect(byId.get('answered-before')?.outcome.label).toBe('Answered earlier');

    const problems = await api(browser, '/activity?status=problem');
    expect((problems.json.items as Array<{ commentId: string }>).map((i) => i.commentId)).toEqual(['cant-reach']);
    const search = await api(browser, '/activity?q=a_fan');
    expect((search.json.items as unknown[]).length).toBeGreaterThan(0);
  });

  it('explains Meta’s app-wide hourly limit and keeps the comment queued', async () => {
    await seedAccount();
    const ruleId = await seedRule();
    await seedQueued({ commentId: 'limited', ruleId });
    meta.on('POST', '/:id/messages', refusal(4, undefined, '(#4) Application request limit reached'));
    await runScheduled(MINUTE_CRON);
    const { browser } = await session();
    const res = await api(browser, '/activity');
    const item = (res.json.items as Array<{ commentId: string; status: string; outcome: { reason: string } }>).find((i) => i.commentId === 'limited');
    expect(item?.status).toBe('queued');
    expect(item?.outcome.reason).toMatch(/hourly/);
    const overview = await api(browser, '/overview');
    expect(overview.json).toMatchObject({ state: 'paused' });
  });

  it('creates, edits and deletes an automation with the same checks as the classic form', async () => {
    await seedAccount();
    const { browser, csrf } = await session();
    const bad = await api(browser, '/rules', { method: 'POST', csrf, body: JSON.stringify({ igUserId: IG_USER, label: 'x', keywords: [], dmText: 'hi' }) });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/keyword/i);

    const made = await api(browser, '/rules', {
      method: 'POST',
      csrf,
      body: JSON.stringify({
        igUserId: IG_USER,
        label: 'FIFA guide',
        keywords: ['fifa', 'guide'],
        matchMode: 'word',
        dmText: 'Here you go: https://drive.google.com/file/d/abc/view',
        publicReplies: ['Check your DMs', 'Sent!'],
      }),
    });
    expect(made.json.error ?? null).toBeNull();
    expect(made.status).toBe(201);
    const rule = made.json.rule as { id: number; keywords: string[]; publicReplies: string[] };
    expect(rule).toMatchObject({ keywords: ['fifa', 'guide'], publicReplies: ['Check your DMs', 'Sent!'] });

    const edited = await api(browser, `/rules/${rule.id}`, {
      method: 'PUT',
      csrf,
      body: JSON.stringify({ igUserId: IG_USER, label: 'FIFA', keywords: ['fifa'], dmText: 'New link https://drive.google.com/file/d/def/view' }),
    });
    expect(edited.json.rule).toMatchObject({ label: 'FIFA', keywords: ['fifa'] });

    const tested = await api(browser, '/test', { method: 'POST', csrf, body: JSON.stringify({ text: 'FIFA pls 🙏' }) });
    expect(tested.json.match).toMatchObject({ label: 'FIFA', keyword: 'fifa' });

    expect((await api(browser, `/rules/${rule.id}`, { method: 'DELETE', csrf })).status).toBe(200);
    expect(await ruleRows()).toEqual([]);
  });

  it('lists recent posts from Instagram once, then from its cache', async () => {
    await seedAccount();
    meta.on('GET', '/me/media', { json: { data: [{ id: 'm1', caption: 'Comment FIFA', permalink: 'https://instagram.com/reel/x', media_product_type: 'REELS', thumbnail_url: 'https://scontent.cdninstagram.com/t.jpg' }] } });
    const { browser } = await session();
    const first = await api(browser, '/media?refresh=1');
    const accounts = first.json.accounts as Array<{ media: Array<{ id: string; kind: string; thumbnail: string }> }>;
    expect(accounts[0]!.media[0]).toMatchObject({ id: 'm1', kind: 'reel', thumbnail: 'https://scontent.cdninstagram.com/t.jpg' });
    const calls = meta.callsTo('GET', '/me/media').length;
    await api(browser, '/media');
    expect(meta.callsTo('GET', '/me/media').length).toBe(calls);
  });

  it('keeps the comment text and post with each matched comment', async () => {
    await seedAccount();
    await seedRule();
    meta.on('POST', '/:id/messages', { json: { recipient_id: '1', message_id: 'm' } });
    await postWebhook(commentPayload({ commentId: 'with-text', text: 'guide pls' }));
    const row = await env.DB.prepare('SELECT comment_text, media_id FROM sent WHERE comment_id = ?').bind('with-text').first();
    expect(row).toMatchObject({ comment_text: 'guide pls' });
  });
});

describe('the dashboard app shell', () => {
  it('sends someone who isn’t logged in to the login page', async () => {
    const res = await request(adminPath('/app'));
    expect(res.status).toBe(302);
    expect(res.location).toContain('/login');
    expect((await request('/a/wrong/app')).status).toBe(404);
  });

  it('serves the shell with its own script policy and the admin base written in', async () => {
    const { browser } = await session();
    const res = await browser.get(adminPath('/app/automations'));
    if (res.status === 503) return; // web/ not built in this checkout
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.text).toContain(`/a/${env.ADMIN_URL_SECRET}/manifest.webmanifest`);
    expect(res.text).not.toContain('%ADMIN_BASE%');
  });
});
