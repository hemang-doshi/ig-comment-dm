import type { ActivityPage, Media, Overview, Rule, RuleInput, WebhookEvent } from './types';

/** /a/<secret>, read from where the app was opened. */
export const ADMIN_BASE = (() => {
  const m = /^\/a\/[^/]+/.exec(window.location.pathname);
  return m ? m[0] : '';
})();

export const APP_BASE = `${ADMIN_BASE}/app`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let csrf: string | null = null;

async function getCsrf(): Promise<string> {
  if (csrf) return csrf;
  const s = await request<{ csrf: string }>('GET', '/session');
  csrf = s.csrf;
  return csrf;
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await getCsrf();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${ADMIN_BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    window.location.href = `${ADMIN_BASE}/login?next=app`;
    throw new ApiError('Logged out', 401);
  }
  if (res.status === 403 && !retried && method !== 'GET') {
    csrf = null;
    return request<T>(method, path, body, true);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  overview: () => request<Overview>('GET', '/overview'),
  activity: (params: { status?: string; rule?: string; q?: string; before?: number; beforeId?: string }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    return request<ActivityPage>('GET', `/activity?${qs}`);
  },
  rules: () => request<{ rules: Rule[] }>('GET', '/rules'),
  media: (refresh = false) =>
    request<{ accounts: { igUserId: string; username: string; media: Media[] }[]; cachedAt: number }>('GET', `/media${refresh ? '?refresh=1' : ''}`),
  events: () => request<{ events: WebhookEvent[] }>('GET', '/events'),
  createRule: (input: RuleInput) => request<{ rule: Rule }>('POST', '/rules', input),
  updateRule: (id: number, input: RuleInput) => request<{ rule: Rule }>('PUT', `/rules/${id}`, input),
  toggleRule: (id: number) => request<{ rule: Rule }>('POST', `/rules/${id}/toggle`),
  deleteRule: (id: number) => request<{ ok: true }>('DELETE', `/rules/${id}`),
  test: (text: string, mediaId: string | null) =>
    request<{
      match: { ruleId: number; label: string; keyword: string | null } | null;
      also: { ruleId: number; label: string; keyword: string | null }[];
      excluded: { ruleId: number; label: string; keyword: string | null; exclusion: string }[];
    }>('POST', '/test', { text, mediaId }),
  retry: (commentId: string) => request<{ ok: true }>('POST', `/activity/${encodeURIComponent(commentId)}/retry`),
};
