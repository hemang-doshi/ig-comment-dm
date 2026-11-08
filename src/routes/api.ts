/**
 * JSON API for the dashboard app (web/). Mounted at /a/<secret>/api, ahead of
 * the HTML admin routes, and protected the same way: the secret path segment,
 * a logged-in session cookie (HttpOnly, SameSite=Strict, signed), and for any
 * request that changes something, the session's CSRF token in the
 * X-CSRF-Token header. Nothing here sets cookies or logs anyone in: logging in
 * still happens on the existing /login page.
 *
 * Every Instagram call counts against Meta's hourly budget for the app (about
 * 200 calls), so reads come from D1 and the one Instagram read here, the list
 * of recent posts, is cached for ten minutes per isolate.
 */
import { Hono, type Context } from 'hono';
import { decryptAesGcm, nowSeconds, timingSafeEqualString } from '../crypto.ts';
import {
  type Span,
  deleteRule,
  getRule,
  healthSnapshot,
  insertRule,
  listAccounts,
  listRules,
  queueOverview,
  recentWebhookEvents,
  retryUnsureSend,
  sendTotals,
  toggleRule,
  updateRule,
} from '../db.ts';
import { explainSend } from '../explain.ts';
import { matchComment, parseKeywords } from '../match.ts';
import { type IgMediaItem, listRecentMedia } from '../meta.ts';
import { parsePublicReplies } from '../replies.ts';
import { readSession, readSessionBinding } from '../session.ts';
import type { Env, Rule } from '../types.ts';
import { readRuleFields } from './admin.ts';
import { findConfigProblems } from '../config.ts';

type Vars = { csrf: string };
type ApiContext = Context<{ Bindings: Env; Variables: Vars }>;

export const apiRoutes = new Hono<{ Bindings: Env; Variables: Vars }>({ strict: false });

apiRoutes.onError((err, c) => {
  console.error('api error', err instanceof Error ? err.message : err);
  return c.json({ error: 'Something went wrong on the server. Try again in a moment.' }, 500);
});

apiRoutes.use('*', async (c, next) => {
  const secret = c.req.param('secret') ?? new URL(c.req.url).pathname.split('/')[2] ?? '';
  if (!timingSafeEqualString(secret, c.env.ADMIN_URL_SECRET ?? '')) return c.json({ error: 'Not found' }, 404);
  const { binding, hasPassword } = await readSessionBinding(c.env.DB);
  const session = await readSession(c.env.SESSION_SIGNING_KEY, binding, c.req.header('Cookie'));
  if (!hasPassword || !session?.authed) return c.json({ error: 'Not logged in', login: true }, 401);
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const token = c.req.header('X-CSRF-Token') ?? '';
    if (!timingSafeEqualString(token, session.csrf)) return c.json({ error: 'This page is out of date. Reload it and try again.' }, 403);
  }
  c.set('csrf', session.csrf);
  c.header('Cache-Control', 'no-store');
  await next();
});

/* ------------------------------------------------------------------ helpers */

type MediaCache = { at: number; items: Map<string, IgMediaItem[]> };
const mediaCache: MediaCache = { at: 0, items: new Map() };
const MEDIA_TTL_MS = 10 * 60 * 1000;

async function recentMedia(env: Env, force = false): Promise<Map<string, IgMediaItem[]>> {
  if (!force && Date.now() - mediaCache.at < MEDIA_TTL_MS && mediaCache.items.size) return mediaCache.items;
  const accounts = await listAccounts(env.DB);
  const out = new Map<string, IgMediaItem[]>();
  for (const a of accounts) {
    try {
      const token = await decryptAesGcm(env.TOKEN_ENCRYPTION_KEY, a.token_iv, a.access_token_enc);
      out.set(a.ig_user_id, await listRecentMedia(token, undefined, a.ig_user_id));
    } catch (err) {
      console.error('api media failed', a.ig_user_id, err instanceof Error ? err.message : err);
      out.set(a.ig_user_id, mediaCache.items.get(a.ig_user_id) ?? []);
    }
  }
  mediaCache.at = Date.now();
  mediaCache.items = out;
  return out;
}

function mediaIndex(media: Map<string, IgMediaItem[]>): Map<string, IgMediaItem> {
  const idx = new Map<string, IgMediaItem>();
  for (const list of media.values()) for (const m of list) idx.set(m.id, m);
  return idx;
}

function ruleJson(r: Rule, media?: Map<string, IgMediaItem>) {
  return {
    id: r.id,
    igUserId: r.ig_user_id,
    label: r.label,
    keywords: parseKeywords(r.keywords),
    excludeKeywords: parseKeywords(r.exclude_keywords),
    matchMode: r.match_mode,
    matchAll: r.match_all === 1,
    replyWithoutDm: r.reply_without_dm === 1,
    mediaId: r.media_id,
    media: r.media_id ? (media?.get(r.media_id) ?? null) : null,
    dmText: r.dm_text,
    publicReplies: parsePublicReplies(r.public_reply_text),
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

const DAY = 86_400;

function startOfUtcDay(now: number): number {
  return now - (now % DAY);
}

type ActivityRow = {
  comment_id: string;
  ig_user_id: string;
  rule_id: number | null;
  rule_label: string | null;
  rule_media_id: string | null;
  commenter_id: string | null;
  dm_status: string;
  reply_status: string | null;
  error: string | null;
  sent_at: number;
  attempts: number;
  next_attempt_at: number | null;
  comment_at: number | null;
  username: string | null;
  comment_text: string | null;
  media_id: string | null;
};

const STATUS_GROUPS: Record<string, string[]> = {
  sent: ['ok'],
  waiting: ['queued', 'pending', 'retry'],
  problem: ['failed', 'unsure'],
  skipped: ['skipped'],
};

/* -------------------------------------------------------------------- reads */

apiRoutes.get('/session', (c) => c.json({ csrf: c.get('csrf') }));

apiRoutes.get('/overview', async (c) => {
  const env = c.env;
  const now = nowSeconds();
  const today = startOfUtcDay(now);
  const spans: Span[] = [
    { from: now - DAY },
    { from: now - 7 * DAY },
    { from: now - 30 * DAY },
    { from: 0 },
  ];
  const [health, queues, totals, accounts, rules, events, hourly] = await Promise.all([
    healthSnapshot(env.DB, now),
    queueOverview(env.DB, now),
    sendTotals(env.DB, spans),
    listAccounts(env.DB),
    listRules(env.DB),
    recentWebhookEvents(env.DB, 1),
    env.DB.prepare(
      `SELECT (sent_at - (sent_at % 3600)) AS hour,
              COUNT(CASE WHEN dm_status = 'ok' THEN 1 END) AS sent,
              COUNT(CASE WHEN dm_status IN ('failed','unsure') THEN 1 END) AS problems
       FROM sent WHERE sent_at >= ? GROUP BY hour ORDER BY hour`,
    )
      .bind(now - DAY)
      .all<{ hour: number; sent: number; problems: number }>(),
  ]);

  const paused = queues.find((q) => q.paused_until > now);
  const waiting = queues.reduce((n, q) => n + q.queued + q.retrying, 0);
  const problems = findConfigProblems(env);

  // One sentence the creator can trust at a glance.
  let state: 'ok' | 'busy' | 'paused' | 'attention' = 'ok';
  let headline = 'Everything’s working. New comments get a reply within seconds.';
  if (problems.length || health.needsReconnect > 0 || health.activeAccounts === 0) {
    state = 'attention';
    headline =
      health.activeAccounts === 0
        ? 'No Instagram account is connected, so nothing is being answered.'
        : health.needsReconnect > 0
          ? 'Instagram needs to be reconnected before DMs can go out.'
          : 'A setting needs fixing before DMs can go out.';
  } else if (paused) {
    state = 'paused';
    headline = `Meta’s hourly limit was reached. ${waiting} ${waiting === 1 ? 'reply is' : 'replies are'} waiting and will go out automatically.`;
  } else if (waiting > 0) {
    state = 'busy';
    headline = `Catching up: ${waiting} ${waiting === 1 ? 'reply' : 'replies'} in line, newest first.`;
  }

  return c.json({
    now,
    state,
    headline,
    problems: problems.map((p) => ({ secret: p.secret, problem: p.detail, fix: p.fix })),
    health: {
      lastWebhookAt: health.lastWebhookAt,
      lastPollOkAt: health.lastPollOkAt,
      lastCronOkAt: health.lastCronOkAt,
      lastEventAt: events[0]?.received_at ?? null,
    },
    queue: {
      waiting,
      retrying: queues.reduce((n, q) => n + q.retrying, 0),
      pausedUntil: paused?.paused_until ?? null,
      oldestCommentAt: queues.reduce<number | null>((m, q) => (q.oldest_comment_at != null && (m == null || q.oldest_comment_at < m) ? q.oldest_comment_at : m), null),
      callsLastHour: queues.reduce((n, q) => n + q.calls_last_hour, 0),
    },
    totals: {
      day: totals[0],
      week: totals[1],
      month: totals[2],
      all: totals[3],
      todayUtcFrom: today,
    },
    hourly: hourly.results ?? [],
    accounts: accounts.map((a) => ({
      igUserId: a.ig_user_id,
      username: a.username,
      active: a.active === 1,
      needsReconnect: a.needs_reconnect === 1,
      connectedAt: a.connected_at,
    })),
    rules: { total: rules.length, active: rules.filter((r) => r.active === 1).length },
  });
});

apiRoutes.get('/activity', async (c) => {
  const env = c.env;
  const now = nowSeconds();
  const limit = Math.min(100, Math.max(10, Number(c.req.query('limit') ?? 50) || 50));
  const status = c.req.query('status') ?? '';
  const rule = c.req.query('rule') ?? '';
  const q = (c.req.query('q') ?? '').trim().toLowerCase().replace(/^@/, '');
  const before = Number(c.req.query('before') ?? 0) || 0;
  const beforeId = c.req.query('beforeId') ?? '';

  const where: string[] = [];
  const binds: (string | number)[] = [];
  const group = STATUS_GROUPS[status];
  if (group) {
    where.push(`s.dm_status IN (${group.map(() => '?').join(',')})`);
    binds.push(...group);
  }
  if (rule && /^\d+$/.test(rule)) {
    where.push('s.rule_id = ?');
    binds.push(Number(rule));
  }
  if (q) {
    where.push("(LOWER(COALESCE(s.username,'')) LIKE ? OR LOWER(COALESCE(s.comment_text,'')) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (before) {
    where.push('(s.sent_at < ? OR (s.sent_at = ? AND s.comment_id < ?))');
    binds.push(before, before, beforeId);
  }
  const sql = `SELECT s.comment_id, s.ig_user_id, s.rule_id, r.label AS rule_label, r.media_id AS rule_media_id,
                      s.commenter_id, s.dm_status, s.reply_status, s.error, s.sent_at, s.attempts,
                      s.next_attempt_at, s.comment_at, s.username, s.comment_text, s.media_id
               FROM sent s LEFT JOIN rules r ON r.id = s.rule_id
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY s.sent_at DESC, s.comment_id DESC
               LIMIT ?`;
  const [{ results }, queues, counts] = await Promise.all([
    env.DB.prepare(sql).bind(...binds, limit + 1).all<ActivityRow>(),
    queueOverview(env.DB, now),
    env.DB.prepare(
      `SELECT COUNT(CASE WHEN dm_status = 'ok' THEN 1 END) AS sent,
              COUNT(CASE WHEN dm_status IN ('queued','pending','retry') THEN 1 END) AS waiting,
              COUNT(CASE WHEN dm_status IN ('failed','unsure') THEN 1 END) AS problem,
              COUNT(CASE WHEN dm_status = 'skipped' THEN 1 END) AS skipped,
              COUNT(*) AS all_rows
       FROM sent`,
    ).first<Record<string, number>>(),
  ]);
  const pausedUntil = queues.find((x) => x.paused_until > now)?.paused_until;
  const rows = results ?? [];
  const page = rows.slice(0, limit);
  return c.json({
    items: page.map((r) => ({
      commentId: r.comment_id,
      username: r.username,
      commentText: r.comment_text,
      ruleId: r.rule_id,
      ruleLabel: r.rule_label,
      mediaId: r.media_id ?? r.rule_media_id,
      status: r.dm_status,
      replyStatus: r.reply_status,
      commentAt: r.comment_at,
      updatedAt: r.sent_at,
      attempts: r.attempts,
      nextAttemptAt: r.next_attempt_at,
      outcome: explainSend(r, { pausedUntil, now }),
      raw: r.error,
    })),
    next: rows.length > limit ? { before: page[page.length - 1]!.sent_at, beforeId: page[page.length - 1]!.comment_id } : null,
    counts: {
      all: counts?.all_rows ?? 0,
      sent: counts?.sent ?? 0,
      waiting: counts?.waiting ?? 0,
      problem: counts?.problem ?? 0,
      skipped: counts?.skipped ?? 0,
    },
  });
});

apiRoutes.get('/rules', async (c) => {
  const [rules, media] = await Promise.all([listRules(c.env.DB), recentMedia(c.env)]);
  const idx = mediaIndex(media);
  const stats = await c.env.DB.prepare(
    `SELECT rule_id,
            COUNT(CASE WHEN dm_status = 'ok' THEN 1 END) AS sent,
            COUNT(CASE WHEN dm_status IN ('queued','pending','retry') THEN 1 END) AS waiting,
            COUNT(CASE WHEN dm_status IN ('failed','unsure') THEN 1 END) AS problem,
            MAX(CASE WHEN dm_status = 'ok' THEN sent_at END) AS last_sent_at
     FROM sent WHERE rule_id IS NOT NULL GROUP BY rule_id`,
  ).all<{ rule_id: number; sent: number; waiting: number; problem: number; last_sent_at: number | null }>();
  const byRule = new Map((stats.results ?? []).map((s) => [s.rule_id, s]));
  return c.json({
    rules: rules.map((r) => {
      const s = byRule.get(r.id);
      return {
        ...ruleJson(r, idx),
        stats: { sent: s?.sent ?? 0, waiting: s?.waiting ?? 0, problem: s?.problem ?? 0, lastSentAt: s?.last_sent_at ?? null },
      };
    }),
  });
});

apiRoutes.get('/media', async (c) => {
  const media = await recentMedia(c.env, c.req.query('refresh') === '1');
  const rules = await listRules(c.env.DB);
  const used = new Map<string, string>();
  for (const r of rules) if (r.media_id) used.set(r.media_id, r.label);
  const accounts = await listAccounts(c.env.DB);
  return c.json({
    accounts: accounts.map((a) => ({
      igUserId: a.ig_user_id,
      username: a.username,
      media: (media.get(a.ig_user_id) ?? []).map((m) => ({ ...m, usedBy: used.get(m.id) ?? null })),
    })),
    cachedAt: Math.floor(mediaCache.at / 1000),
  });
});

apiRoutes.get('/events', async (c) => {
  const events = await recentWebhookEvents(c.env.DB, 30);
  return c.json({
    events: events.map((e) => {
      let username: string | null = null;
      let text: string | null = null;
      let field: string | null = null;
      try {
        const p = JSON.parse(e.preview ?? '') as {
          entry?: Array<{ changes?: Array<{ field?: string; value?: { from?: { username?: string }; text?: string } }> }>;
        };
        const ch = p.entry?.[0]?.changes?.[0];
        field = ch?.field ?? null;
        username = ch?.value?.from?.username ?? null;
        text = ch?.value?.text ?? null;
      } catch {
        /* preview is truncated JSON; fall back to a regex */
        username = /"username":\s*"([^"]+)"/.exec(e.preview ?? '')?.[1] ?? null;
        field = /"field":\s*"([^"]+)"/.exec(e.preview ?? '')?.[1] ?? null;
      }
      return { id: e.id, receivedAt: e.received_at, status: e.status, error: e.error, field, username, text };
    }),
  });
});

/* -------------------------------------------------------------------- writes */

type RuleBody = {
  igUserId?: string;
  label?: string;
  keywords?: string[];
  excludeKeywords?: string[];
  matchMode?: string;
  matchAll?: boolean;
  replyWithoutDm?: boolean;
  mediaId?: string | null;
  dmText?: string;
  publicReplies?: string[];
};

function toForm(b: RuleBody): Record<string, string> {
  const form: Record<string, string> = {
    ig_user_id: b.igUserId ?? '',
    label: b.label ?? '',
    keywords: (b.keywords ?? []).join('\n'),
    exclude_keywords: (b.excludeKeywords ?? []).join('\n'),
    match_mode: b.matchMode ?? 'word',
    media_id: b.mediaId ?? '',
    dm_text: b.dmText ?? '',
  };
  if (b.matchAll) form.match_all = '1';
  if (b.replyWithoutDm) form.reply_without_dm = '1';
  const replies = (b.publicReplies ?? []).filter((r) => r.trim() !== '');
  form.public_reply_text = replies[0] ?? '';
  replies.slice(1).forEach((r, i) => {
    form[`public_reply_text_${String(i + 2)}`] = r;
  });
  return form;
}

async function readBody(c: ApiContext): Promise<RuleBody> {
  try {
    return (await c.req.json()) as RuleBody;
  } catch {
    return {};
  }
}

apiRoutes.post('/rules', async (c) => {
  const accounts = await listAccounts(c.env.DB);
  const fields = readRuleFields(toForm(await readBody(c)), accounts);
  if ('error' in fields && fields.error) return c.json({ error: fields.error }, 400);
  await insertRule(c.env.DB, { ...fields.row!, created_at: nowSeconds() });
  const last = await c.env.DB.prepare('SELECT id FROM rules ORDER BY id DESC LIMIT 1').first<{ id: number }>();
  const rule = last ? await getRule(c.env.DB, last.id) : null;
  return c.json({ rule: rule ? ruleJson(rule) : null }, 201);
});

apiRoutes.put('/rules/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await getRule(c.env.DB, id))) return c.json({ error: 'That automation no longer exists.' }, 404);
  const accounts = await listAccounts(c.env.DB);
  const fields = readRuleFields(toForm(await readBody(c)), accounts);
  if ('error' in fields && fields.error) return c.json({ error: fields.error }, 400);
  await updateRule(c.env.DB, id, fields.row!);
  const rule = await getRule(c.env.DB, id);
  return c.json({ rule: rule ? ruleJson(rule) : null });
});

apiRoutes.post('/rules/:id/toggle', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await getRule(c.env.DB, id))) return c.json({ error: 'That automation no longer exists.' }, 404);
  await toggleRule(c.env.DB, id);
  const rule = await getRule(c.env.DB, id);
  return c.json({ rule: rule ? ruleJson(rule) : null });
});

apiRoutes.delete('/rules/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await getRule(c.env.DB, id))) return c.json({ error: 'That automation no longer exists.' }, 404);
  await deleteRule(c.env.DB, id);
  return c.json({ ok: true });
});

apiRoutes.post('/test', async (c) => {
  let body: { text?: string; mediaId?: string | null } = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty */
  }
  const text = (body.text ?? '').slice(0, 2200);
  const rules = (await listRules(c.env.DB)).filter((r) => r.active === 1);
  const verdict = matchComment(rules, text, body.mediaId ?? undefined);
  return c.json({
    match: verdict.match ? { ruleId: verdict.match.rule.id, label: verdict.match.rule.label, keyword: verdict.match.keyword } : null,
    also: verdict.also.map((m) => ({ ruleId: m.rule.id, label: m.rule.label, keyword: m.keyword })),
    excluded: verdict.excluded.map((x) => ({ ruleId: x.rule.id, label: x.rule.label, keyword: x.keyword, exclusion: x.exclusion })),
  });
});

apiRoutes.post('/activity/:commentId/retry', async (c) => {
  const ok = await retryUnsureSend(c.env.DB, c.req.param('commentId'), nowSeconds());
  if (!ok) return c.json({ error: 'That one already moved on, so nothing changed.' }, 409);
  return c.json({ ok: true });
});
