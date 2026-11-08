import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock, ExternalLink, Gauge, AtSign, LogOut, Monitor, Moon, Radio, RefreshCw, Sun, XCircle } from 'lucide-react';
import { ADMIN_BASE, api } from '@/lib/api';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cn, fullTime, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader, Skeleton } from '@/components/ui/misc';
import { Avatar } from '@/components/activity';

async function logout() {
  const res = await fetch(`${ADMIN_BASE}/api/session`, { credentials: 'same-origin' });
  const { csrf } = (await res.json()) as { csrf: string };
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${ADMIN_BASE}/logout`;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'csrf';
  input.value = csrf;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

export function SettingsPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 20_000 });
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, refetchInterval: 30_000 });
  const [theme, setTheme] = useTheme();
  const o = overview.data;
  const account = o?.accounts[0];

  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" description="Your Instagram connection, how healthy the bot is, and the limits it works within." />

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Instagram connection</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {account ? (
            <div className="flex items-center gap-3">
              <div className="ig-gradient rounded-full p-[2px]">
                <Avatar name={account.username} className="size-11 border-2 border-surface" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  @{account.username}
                  {account.needsReconnect ? <Badge tone="danger">Reconnect needed</Badge> : <Badge tone="success" dot>Connected</Badge>}
                </div>
                <div className="text-xs text-fg-muted">
                  Connected {relativeTime(account.connectedAt)} via Meta’s business login · the connection doesn’t expire
                </div>
              </div>
            </div>
          ) : overview.isLoading ? (
            <Skeleton className="h-11 w-60" />
          ) : (
            <p className="text-sm text-fg-muted">No account connected.</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => (window.location.href = '/connect?reconnect=1')}>
              <RefreshCw /> {account ? 'Reconnect' : 'Connect'}
            </Button>
            {account ? (
              <Button variant="ghost" size="sm" onClick={() => window.open(`https://instagram.com/${account.username}`, '_blank', 'noopener,noreferrer')}>
                <AtSign /> Profile
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Health</h2>
        <p className="mt-0.5 text-xs text-fg-muted">Three independent signals. If one goes quiet, the others keep comments flowing.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <HealthTile
            icon={<Radio />}
            title="Instant delivery"
            ok={!!o?.health.lastWebhookAt}
            value={o?.health.lastWebhookAt ? `Last comment ${relativeTime(o.health.lastWebhookAt)}` : 'Waiting for the first comment'}
            body="Instagram pushes each comment to the bot the moment it’s posted."
          />
          <HealthTile
            icon={<Activity />}
            title="Backup sweep"
            ok={!!o?.health.lastPollOkAt && Date.now() / 1000 - o.health.lastPollOkAt < 15 * 60}
            value={o?.health.lastPollOkAt ? `Ran ${relativeTime(o.health.lastPollOkAt)}` : 'Not yet'}
            body="Every 5 minutes it re-reads your reels’ newest comments, catching anything Instagram forgot to send."
          />
          <HealthTile
            icon={<Clock />}
            title="Daily check"
            ok={!!o?.health.lastCronOkAt}
            pendingOk={!o?.health.lastCronOkAt}
            value={o?.health.lastCronOkAt ? `Ran ${relativeTime(o.health.lastCronOkAt)}` : 'First run at 08:30 IST'}
            body="Once a day: tidies old logs and checks the Instagram connection."
          />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Gauge className="size-4" /> Meta’s hourly allowance
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
              Meta gives a new app a small hourly allowance of API time (about 200 calls per connected person). Every DM, public reply and comment check uses some —
              and slow answers from Instagram use more. When it runs out, Meta pauses the bot for a few minutes. Nothing is lost: comments wait in line and go out
              automatically, newest first, without using up their tries.
            </p>
          </div>
          {o?.queue.pausedUntil ? <Badge tone="warning">Paused until {new Date(o.queue.pausedUntil * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Badge> : <Badge tone="success">Within limits</Badge>}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-fg-muted">
            <span>DM calls in the last hour</span>
            <span className="tabular">{o?.queue.callsLastHour ?? 0} / ~200</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full transition-[width]', (o?.queue.callsLastHour ?? 0) > 150 ? 'bg-warning' : 'bg-accent')} style={{ width: `${Math.min(100, ((o?.queue.callsLastHour ?? 0) / 200) * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold">Live from Instagram</h2>
          <p className="text-xs text-fg-muted">The last 30 notifications Instagram sent the bot. Your own replies show up here too.</p>
        </div>
        <ul className="max-h-96 divide-y divide-border overflow-y-auto scrollbar-thin">
          {events.isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="px-5 py-3">
                  <Skeleton className="w-64" />
                </li>
              ))
            : events.data?.events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  {e.status === 'bad_signature' || e.error ? <XCircle className="size-4 text-danger" /> : <CheckCircle2 className="size-4 text-success" />}
                  <span className="w-28 shrink-0 text-xs text-fg-subtle tabular" title={fullTime(e.receivedAt)}>
                    {relativeTime(e.receivedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.username ? <span className="font-medium">@{e.username}</span> : <span className="text-fg-muted">{e.field ?? 'event'}</span>}
                    {e.text ? <span className="text-fg-muted"> · “{e.text}”</span> : null}
                    {e.error ? <span className="text-danger"> · {e.error}</span> : null}
                  </span>
                </li>
              ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Appearance</h2>
        <div className="mt-3 inline-grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
          {(
            [
              ['system', 'System', Monitor],
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ] as [ThemePref, string, typeof Sun][]
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              role="radio"
              aria-checked={theme === k}
              onClick={() => setTheme(k)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium', theme === k ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg')}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-fg-muted">
          Tip: press <b>⌘K</b> anywhere to search, <b>N</b> for a new automation, <b>G</b> then <b>A</b> for Activity.
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 px-1">
        <a href={`${ADMIN_BASE}/`} className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
          <ExternalLink className="size-3.5" /> Classic admin pages
        </a>
        <Button variant="danger-ghost" size="sm" onClick={logout}>
          <LogOut /> Log out everywhere
        </Button>
      </section>
    </div>
  );
}

function HealthTile({ icon, title, value, body, ok, pendingOk }: { icon: React.ReactNode; title: string; value: string; body: string; ok: boolean; pendingOk?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-4 [&_svg]:size-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          {icon}
          {title}
        </span>
        {ok ? <Badge tone="success" dot>OK</Badge> : pendingOk ? <Badge tone="neutral">Scheduled</Badge> : <Badge tone="warning">Check</Badge>}
      </div>
      <div className="mt-2 text-[13px] font-medium">{value}</div>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
