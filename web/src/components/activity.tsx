import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Info, MessageCircle, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityItem, Outcome } from '@/lib/types';
import { api } from '@/lib/api';
import { cn, fullTime, localizeIsoInText, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';

export function OutcomeIcon({ tone, className }: { tone: Outcome['tone']; className?: string }) {
  const Icon = { success: CheckCircle2, pending: Clock, warning: AlertTriangle, danger: XCircle, info: Info }[tone];
  const color = { success: 'text-success', pending: 'text-pending', warning: 'text-warning', danger: 'text-danger', info: 'text-fg-subtle' }[tone];
  return <Icon className={cn('size-4 shrink-0', color, className)} aria-hidden />;
}

export function Avatar({ name, className }: { name: string | null; className?: string }) {
  const n = (name ?? '?').replace(/^@/, '');
  // Stable colour per username, so the same person is recognisable across the list.
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      className={cn('grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white', className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 70% 45%))` }}
      aria-hidden
    >
      {n.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ActivityRow({ item, onOpen, compact }: { item: ActivityItem; onOpen: () => void; compact?: boolean }) {
  const o = item.outcome;
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2/70 sm:px-5"
    >
      <Avatar name={item.username} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">@{item.username ?? 'someone'}</span>
          {item.ruleLabel && !compact ? <span className="hidden truncate text-xs text-fg-subtle sm:inline">· {item.ruleLabel.split('→')[0]?.trim()}</span> : null}
        </div>
        {item.commentText ? (
          <p className="mt-0.5 truncate text-[13px] text-fg-muted">“{item.commentText}”</p>
        ) : (
          <p className="mt-0.5 truncate text-[13px] text-fg-subtle">{o.title}</p>
        )}
        {!compact && o.tone !== 'success' && item.commentText ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <OutcomeIcon tone={o.tone} className="size-3.5" />
            <span className="line-clamp-1">{o.title}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge tone={o.tone === 'info' ? 'neutral' : o.tone} dot>
          {o.label}
        </Badge>
        <Tooltip content={fullTime(item.commentAt ?? item.updatedAt)}>
          <span className="text-xs text-fg-subtle tabular">{relativeTime(item.commentAt ?? item.updatedAt)}</span>
        </Tooltip>
      </div>
    </button>
  );
}

export function ActivityDetail({ item, onClose }: { item: ActivityItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: string) => api.retry(id),
    onSuccess: () => {
      toast.success('Queued to check again', { description: 'It goes out within a minute or two. It can’t send twice.' });
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const o = item?.outcome;
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      {item && o ? (
        <DialogContent title={`@${item.username ?? 'someone'}`} description={item.ruleLabel ?? undefined} side="right" className="max-w-lg">
          <div className="space-y-6 p-6">
            {item.commentText ? (
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-fg-subtle">
                  <MessageCircle className="size-3.5" /> Their comment
                </div>
                <p className="text-[15px]">{item.commentText}</p>
              </div>
            ) : null}

            <div
              className={cn(
                'rounded-xl p-4',
                { success: 'bg-success-soft', pending: 'bg-pending-soft', warning: 'bg-warning-soft', danger: 'bg-danger-soft', info: 'bg-surface-2' }[o.tone],
              )}
            >
              <div className="flex items-start gap-2.5">
                <OutcomeIcon tone={o.tone} className="mt-0.5 size-5" />
                <div className="space-y-1.5">
                  <h3 className="text-[15px] font-semibold leading-snug">{o.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-fg/80">{localizeIsoInText(o.reason)}</p>
                  {o.action ? (
                    <p className="text-[13.5px] font-medium leading-relaxed">
                      <span className="text-fg-muted">What to do: </span>
                      {o.action}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              <dt className="text-fg-muted">Commented</dt>
              <dd className="tabular">{fullTime(item.commentAt) || '—'}</dd>
              <dt className="text-fg-muted">Last update</dt>
              <dd className="tabular">{fullTime(item.updatedAt)}</dd>
              <dt className="text-fg-muted">DM tries</dt>
              <dd className="tabular">{item.attempts}</dd>
              {item.nextAttemptAt && ['queued', 'retry'].includes(item.status) ? (
                <>
                  <dt className="text-fg-muted">Next try</dt>
                  <dd className="tabular">
                    {fullTime(item.nextAttemptAt)} ({relativeTime(item.nextAttemptAt)})
                  </dd>
                </>
              ) : null}
              <dt className="text-fg-muted">Public reply</dt>
              <dd>{item.replyStatus === 'ok' ? 'Posted' : item.replyStatus === 'failed' ? 'Didn’t post' : item.replyStatus === 'skipped' ? 'Skipped (no DM went out)' : '—'}</dd>
              {o.code ? (
                <>
                  <dt className="text-fg-muted">Meta code</dt>
                  <dd className="font-mono text-xs">{o.code}</dd>
                </>
              ) : null}
            </dl>

            <div className="flex flex-wrap gap-2">
              {item.username ? (
                <Button variant="secondary" size="sm" onClick={() => window.open(`https://instagram.com/${item.username}`, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink /> Open profile
                </Button>
              ) : null}
              {o.retryable ? (
                <Button variant="primary" size="sm" loading={retry.isPending} onClick={() => retry.mutate(item.commentId)}>
                  <RotateCcw /> Check again now
                </Button>
              ) : null}
            </div>

            {item.raw ? (
              <details className="group rounded-lg border border-border">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-muted">Technical details</summary>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-border bg-surface-2 p-3 font-mono text-[11.5px] text-fg-muted">{item.raw}</pre>
              </details>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
