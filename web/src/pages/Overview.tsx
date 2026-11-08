import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Hourglass, Inbox, MessageSquareText, Radio, ShieldAlert, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ActivityItem, Overview } from '@/lib/types';
import { clockTime, cn, plural, relativeTime } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Skeleton, StatusDot } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { ActivityDetail, ActivityRow } from '@/components/activity';
import { MediaThumb } from '@/components/media';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 20_000 });
  const activity = useQuery({ queryKey: ['activity', 'recent'], queryFn: () => api.activity({}), refetchInterval: 20_000 });
  const [open, setOpen] = useState<ActivityItem | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-fg-muted">{greeting()}, @{data?.accounts[0]?.username ?? '…'}</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">Overview</h1>
      </div>

      {isLoading || !data ? <HeroSkeleton /> : <StatusHero data={data} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<MessageSquareText />} label="Guides sent today" value={data?.totals.day.sent} hint="Last 24 hours" />
        <Kpi icon={<Users />} label="People reached" value={data?.totals.week.reached} hint="Last 7 days" />
        <Kpi icon={<Hourglass />} label="Waiting" value={data?.queue.waiting} hint={data?.queue.waiting ? 'Newest first' : 'Nothing in line'} tone={data?.queue.waiting ? 'pending' : undefined} />
        <Kpi
          icon={<ShieldAlert />}
          label="Didn’t go through"
          value={data ? data.problemsWeek : undefined}
          hint="Last 7 days · tap for why"
          to="/activity?status=problem"
          tone={data?.problemsWeek ? 'warning' : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h2 className="text-[15px] font-semibold">Last 24 hours</h2>
              <p className="text-xs text-fg-muted">DMs delivered per hour</p>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold tabular">{data?.totals.day.sent ?? '–'}</div>
              <div className="text-xs text-fg-muted">delivered</div>
            </div>
          </div>
          <HourlyChart data={data} />
        </section>
        <section className="card lg:col-span-2">
          <AutomationsMini />
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Latest comments</h2>
            <p className="text-xs text-fg-muted">Every keyword comment and exactly what happened to it</p>
          </div>
          <ButtonLink to="/activity">
            View all <ArrowRight className="size-3.5" />
          </ButtonLink>
        </div>
        <div className="divide-y divide-border">
          {activity.isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              ))
            : activity.data?.items.slice(0, 6).map((item) => <ActivityRow key={item.commentId} item={item} onOpen={() => setOpen(item)} />)}
          {activity.data && activity.data.items.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-fg-muted">
              <Inbox className="size-5" /> No keyword comments yet. They’ll show up here the moment they arrive.
            </div>
          ) : null}
        </div>
      </section>
      <ActivityDetail item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

// A link styled as a quiet button, used in card headers.
function ButtonLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
      {children}
    </Link>
  );
}


function StatusHero({ data }: { data: Overview }) {
  const tone = data.state === 'ok' ? 'success' : data.state === 'attention' ? 'danger' : data.state === 'paused' ? 'warning' : 'pending';
  const title = { ok: 'Live and answering', busy: 'Catching up', paused: 'Briefly paused by Meta', attention: 'Needs your attention' }[data.state];
  const ring = { success: 'from-success/15', danger: 'from-danger/15', warning: 'from-warning/15', pending: 'from-pending/15' }[tone];
  const lastIn = data.health.lastWebhookAt;
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('card relative overflow-hidden bg-gradient-to-br to-transparent p-5 sm:p-6', ring)}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="mt-1.5">
            <StatusDot tone={tone} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-0.5 max-w-xl text-[14px] text-fg-muted">{data.headline}</p>
            {data.queue.pausedUntil ? (
              <p className="mt-2 text-[13px] font-medium text-warning">
                Resumes at {clockTime(data.queue.pausedUntil)} ({relativeTime(data.queue.pausedUntil)}). Nothing is lost; comments stay in line.
              </p>
            ) : null}
            {data.problems.map((p) => (
              <p key={p.secret} className="mt-2 text-[13px] text-danger">
                {p.problem} — {p.fix}
              </p>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:w-[340px]">
          <Signal icon={<Radio />} label="Last in" value={lastIn ? relativeTime(lastIn) : 'never'} tip="When Instagram last told us about a comment (webhook)." />
          <Signal icon={<Zap />} label="Sweep" value={data.health.lastPollOkAt ? relativeTime(data.health.lastPollOkAt) : 'not yet'} tip="Every 5 minutes the bot re-reads your reels' comments in case Instagram missed telling us." />
          <Signal icon={<Users />} label="Rules on" value={`${data.rules.active}/${data.rules.total} on`} tip="Automations switched on, out of all you have." />
        </div>
      </div>
    </motion.section>
  );
}

function Signal({ icon, label, value, tip }: { icon: React.ReactNode; label: string; value: string; tip: string }) {
  return (
    <Tooltip content={tip}>
      <div className="rounded-xl border border-border bg-surface/80 p-2.5 [&_svg]:size-3.5">
        <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-1 truncate text-[13px] font-semibold">{value}</div>
      </div>
    </Tooltip>
  );
}

function HeroSkeleton() {
  return (
    <div className="card space-y-3 p-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

function Kpi({ icon, label, value, hint, tone, to }: { icon: React.ReactNode; label: string; value: number | undefined; hint: string; tone?: 'pending' | 'warning'; to?: string }) {
  const navigate = useNavigate();
  const Comp = to ? 'button' : 'div';
  return (
    <Comp
      onClick={to ? () => navigate(to) : undefined}
      className={cn('card p-4 text-left transition-shadow [&_svg]:size-4', to && 'hover:shadow-md')}
    >
      <div className={cn('flex items-center gap-1.5 text-[12.5px] text-fg-muted', tone === 'pending' && 'text-pending', tone === 'warning' && 'text-warning')}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular">{value === undefined ? <Skeleton className="h-7 w-12" /> : value.toLocaleString()}</div>
      <div className="mt-1.5 text-xs text-fg-subtle">{hint}</div>
    </Comp>
  );
}

function HourlyChart({ data }: { data: Overview | undefined }) {
  const bars = useMemo(() => {
    if (!data) return [];
    const nowHour = data.now - (data.now % 3600);
    const map = new Map(data.hourly.map((h) => [h.hour, h]));
    return Array.from({ length: 24 }, (_, i) => {
      const hour = nowHour - (23 - i) * 3600;
      const h = map.get(hour);
      return { hour, sent: h?.sent ?? 0, problems: h?.problems ?? 0 };
    });
  }, [data]);
  const max = Math.max(4, ...bars.map((b) => b.sent + b.problems));
  return (
    <div className="px-5 pb-4 pt-3">
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="DMs delivered per hour over the last 24 hours">
        {bars.length === 0
          ? Array.from({ length: 24 }, (_, i) => <div key={i} className="skeleton flex-1" style={{ height: `${20 + ((i * 37) % 60)}%` }} />)
          : bars.map((b) => (
              <Tooltip
                key={b.hour}
                content={
                  <span>
                    {clockTime(b.hour)} · {plural(b.sent, 'DM')} sent{b.problems ? `, ${b.problems} didn’t go` : ''}
                  </span>
                }
              >
                <div className="group flex h-full flex-1 flex-col justify-end">
                  {b.problems ? <div className="w-full rounded-t-[3px] bg-warning/70" style={{ height: `${(b.problems / max) * 100}%` }} /> : null}
                  <div
                    className={cn('w-full bg-accent/85 transition-opacity group-hover:opacity-100', b.problems ? '' : 'rounded-t-[3px]', b.sent === 0 && 'bg-border opacity-60')}
                    style={{ height: b.sent ? `${(b.sent / max) * 100}%` : '3px' }}
                  />
                </div>
              </Tooltip>
            ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-fg-subtle tabular">
        <span>{bars[0] ? clockTime(bars[0].hour) : ''}</span>
        <span>{bars[12] ? clockTime(bars[12].hour) : ''}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function AutomationsMini() {
  const { data, isLoading } = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (id: number) => api.toggleRule(id),
    onSuccess: (r) => {
      toast.success(r.rule.active ? `“${r.rule.label}” is on` : `“${r.rule.label}” is paused`, {
        description: r.rule.active ? 'New matching comments get the DM.' : 'Matching comments are ignored until you switch it back on.',
      });
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold">Automations</h2>
          <p className="text-xs text-fg-muted">Flip one off without losing it</p>
        </div>
        <ButtonLink to="/automations">
          Manage <ArrowRight className="size-3.5" />
        </ButtonLink>
      </div>
      <ul className="divide-y divide-border">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="w-32" />
              </li>
            ))
          : data?.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                <MediaThumb media={r.media} className="size-10" />
                <Link to={`/automations/${r.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{r.label}</div>
                  <div className="truncate text-xs text-fg-muted">
                    {r.keywords.map((k) => k.toUpperCase()).join(' · ')} · {plural(r.stats?.sent ?? 0, 'DM')}
                  </div>
                </Link>
                <Switch checked={r.active} onCheckedChange={() => toggle.mutate(r.id)} aria-label={`${r.active ? 'Pause' : 'Resume'} ${r.label}`} />
              </li>
            ))}
      </ul>
    </div>
  );
}
