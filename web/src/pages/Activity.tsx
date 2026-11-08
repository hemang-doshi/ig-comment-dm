import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Inbox, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ActivityItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, SectionHeader, Skeleton } from '@/components/ui/misc';
import { ActivityDetail, ActivityRow } from '@/components/activity';

const TABS = [
  { key: '', label: 'All', count: 'all' },
  { key: 'sent', label: 'Sent', count: 'sent' },
  { key: 'waiting', label: 'Waiting', count: 'waiting' },
  { key: 'problem', label: 'Didn’t go through', count: 'problem' },
  { key: 'skipped', label: 'Skipped / answered earlier', count: 'skipped' },
] as const;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const rule = params.get('rule') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q);
  const [open, setOpen] = useState<ActivityItem | null>(null);
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules });

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const feed = useInfiniteQuery({
    queryKey: ['activity', status, rule, dq],
    queryFn: ({ pageParam }) => api.activity({ status, rule, q: dq, ...(pageParam ?? {}) }),
    initialPageParam: null as null | { before: number; beforeId: string },
    getNextPageParam: (last) => last.next,
    refetchInterval: 20_000,
  });
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const counts = feed.data?.pages[0]?.counts;

  return (
    <div>
      <SectionHeader title="Activity" description="Every keyword comment, what the bot did, and — if a DM didn’t go out — the exact reason." />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-thin" role="tablist" aria-label="Filter by outcome">
            {TABS.map((t) => {
              const active = status === t.key;
              const n = counts?.[t.count];
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => set('status', t.key)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
                    active ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {t.label}
                  {n !== undefined ? <span className={cn('tabular text-xs', active ? 'opacity-70' : 'text-fg-subtle')}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search @name or comment" className="h-9 pl-9 pr-8" aria-label="Search activity" />
              {q ? (
                <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg" aria-label="Clear search">
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <select
              value={rule}
              onChange={(e) => set('rule', e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] shadow-sm focus:border-accent focus:outline-none"
              aria-label="Filter by automation"
            >
              <option value="">All automations</option>
              {rules.data?.rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-border">
          {feed.isLoading ? (
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-40" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={status === 'problem' ? 'Nothing failed' : 'Nothing here yet'}
              body={status === 'problem' ? 'Every keyword comment in this view got its DM.' : 'Keyword comments show up here the moment Instagram tells us about them.'}
            />
          ) : (
            items.map((item) => <ActivityRow key={item.commentId} item={item} onOpen={() => setOpen(item)} />)
          )}
        </div>
        {feed.hasNextPage ? (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
              Load older
            </Button>
          </div>
        ) : null}
      </div>
      <ActivityDetail item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
