import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'motion/react';
import { Copy, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Rule } from '@/lib/types';
import { cn, plural, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, SectionHeader, Skeleton } from '@/components/ui/misc';
import { MediaThumb } from '@/components/media';
import { RuleEditor } from '@/components/RuleEditor';

export function AutomationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const editing = id === 'new' ? 'new' : id ? data?.rules.find((r) => String(r.id) === id) : undefined;
  const [duplicateOf, setDuplicateOf] = useState<Rule | null>(null);

  return (
    <div>
      <SectionHeader
        title="Automations"
        description="One automation per reel: the words that trigger it, the DM it sends, and the public reply under the comment."
        actions={
          <Button variant="primary" onClick={() => navigate('/automations/new')}>
            <Plus /> New automation
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <Skeleton className="aspect-[4/3] w-full rounded-xl" />
              <Skeleton className="w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : !data?.rules.length ? (
        <div className="card">
          <EmptyState
            icon={<Zap />}
            title="No automations yet"
            body="Pick a reel, choose a keyword like FIFA, and write the DM. The bot does the rest, around the clock."
            action={
              <Button variant="primary" onClick={() => navigate('/automations/new')}>
                <Plus /> Create your first
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.rules.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.2 }}>
              <RuleCard rule={r} onDuplicate={() => (setDuplicateOf(r), navigate('/automations/new'))} />
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!editing || id === 'new'} onOpenChange={(o) => !o && (setDuplicateOf(null), navigate('/automations'))}>
        {editing || id === 'new' ? (
          <DialogContent
            side="right"
            title={editing === 'new' || !editing ? (duplicateOf ? `Copy of ${duplicateOf.label}` : 'New automation') : `Edit · ${editing.label}`}
            description="Changes apply to new comments the moment you save."
          >
            <RuleEditor
              key={editing === 'new' || !editing ? `new-${duplicateOf?.id ?? ''}` : editing.id}
              rule={editing && editing !== 'new' ? editing : null}
              template={duplicateOf}
              onDone={() => (setDuplicateOf(null), navigate('/automations'))}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function RuleCard({ rule, onDuplicate }: { rule: Rule; onDuplicate: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const toggle = useMutation({
    mutationFn: () => api.toggleRule(rule.id),
    onSuccess: (r) => {
      toast.success(r.rule.active ? `“${r.rule.label}” is on` : `“${r.rule.label}” is paused`);
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteRule(rule.id),
    onSuccess: () => {
      toast.success(`Deleted “${rule.label}”`);
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      setConfirm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const s = rule.stats;
  const caption = rule.media?.fullCaption || rule.media?.caption;

  return (
    <article className={cn('card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md', !rule.active && 'opacity-75')}>
      <Link to={`/automations/${rule.id}`} className="relative block aspect-[16/10] overflow-hidden bg-surface-2">
        {rule.media?.thumbnail ? (
          <img src={rule.media.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
        ) : (
          <div className="grid size-full place-items-center">
            <MediaThumb media={rule.media} all={!rule.mediaId} className="size-14" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
          <div className="flex flex-wrap gap-1.5">
            {rule.keywords.slice(0, 4).map((k) => (
              <span key={k} className="rounded-md bg-white/90 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-black">
                {k}
              </span>
            ))}
            {rule.matchAll ? <span className="rounded-md bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-black">Every comment</span> : null}
          </div>
        </div>
        <div className="absolute left-3 top-3">
          <Badge tone={rule.active ? 'success' : 'neutral'} dot className="bg-white/90 text-black">
            {rule.active ? 'On' : 'Paused'}
          </Badge>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">{rule.label}</h3>
            <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{rule.mediaId ? caption || 'Specific post' : 'All posts and reels'}</p>
          </div>
          <Switch checked={rule.active} onCheckedChange={() => toggle.mutate()} disabled={toggle.isPending} aria-label={rule.active ? 'Pause automation' : 'Resume automation'} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={s?.sent ?? 0} label="Sent" />
          <Stat value={s?.waiting ?? 0} label="Waiting" tone={s?.waiting ? 'pending' : undefined} />
          <Stat value={s?.problem ?? 0} label="Didn’t go" tone={s?.problem ? 'warning' : undefined} to={`/activity?status=problem&rule=${rule.id}`} />
        </div>
        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-fg-subtle">
          <span>{s?.lastSentAt ? `Last DM ${relativeTime(s.lastSentAt)}` : 'No DMs yet'}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/automations/${rule.id}`)} aria-label="Edit">
              <Pencil />
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lg">
                  <MenuItem onSelect={() => navigate(`/activity?rule=${rule.id}`)}>View its activity</MenuItem>
                  <MenuItem onSelect={() => toggle.mutate()} icon={rule.active ? <Pause /> : <Play />}>
                    {rule.active ? 'Pause' : 'Resume'}
                  </MenuItem>
                  <MenuItem onSelect={onDuplicate} icon={<Copy />}>
                    Duplicate
                  </MenuItem>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <MenuItem onSelect={() => setConfirm(true)} icon={<Trash2 />} danger>
                    Delete…
                  </MenuItem>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={`Delete “${rule.label}”?`} description="New comments on this reel stop getting the DM. Its history stays in Activity. If you might want it back, pause it instead.">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => (toggle.mutate(), setConfirm(false))} disabled={!rule.active}>
              Pause instead
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function MenuItem({ children, onSelect, icon, danger }: { children: React.ReactNode; onSelect: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn('flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4', danger ? 'text-danger' : 'text-fg')}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

function Stat({ value, label, tone, to }: { value: number; label: string; tone?: 'pending' | 'warning'; to?: string }) {
  const body = (
    <>
      <div className={cn('text-lg font-semibold tabular', tone === 'pending' && 'text-pending', tone === 'warning' && 'text-warning')}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-fg-subtle">{label}</div>
    </>
  );
  return to && value > 0 ? (
    <Link to={to} className="rounded-lg bg-surface-2 py-2 hover:bg-border/60">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg bg-surface-2 py-2">{body}</div>
  );
}

export function usePluralSummary(rules: Rule[] | undefined) {
  return useMemo(() => (rules ? plural(rules.filter((r) => r.active).length, 'automation') + ' on' : ''), [rules]);
}
