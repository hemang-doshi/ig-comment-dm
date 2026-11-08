import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AtSign, Check, ChevronDown, Globe2, Link2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { previewMatch } from '@/lib/match';
import type { Media, Rule, RuleInput } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MediaThumb } from '@/components/media';

const DM_MAX = 1000;
const REPLY_MAX = 300;
const DEFAULT_REPLIES = ['Sent, check your DMs 📩', 'Check your DMs (peek in Requests too) 🙌', 'Done, the guide is in your inbox 🎮'];

function fromRule(r: Rule | null, template: Rule | null, igUserId: string): RuleInput {
  const src = r ?? template;
  return {
    igUserId: src?.igUserId ?? igUserId,
    label: r ? r.label : template ? `${template.label} (copy)` : '',
    keywords: src?.keywords ?? [],
    excludeKeywords: src?.excludeKeywords ?? [],
    matchMode: src?.matchMode ?? 'word',
    matchAll: src?.matchAll ?? false,
    replyWithoutDm: src?.replyWithoutDm ?? false,
    mediaId: r ? r.mediaId : null,
    dmText: src?.dmText ?? "Hey {username}! Here's the full guide 👇\n\n\n\nIf you get stuck, reply here and tell me where 🙌",
    publicReplies: src?.publicReplies.length ? src.publicReplies : DEFAULT_REPLIES,
  };
}

export function RuleEditor({ rule, template, onDone }: { rule: Rule | null; template: Rule | null; onDone: () => void }) {
  const qc = useQueryClient();
  const media = useQuery({ queryKey: ['media'], queryFn: () => api.media() });
  const account = media.data?.accounts[0];
  const [form, setForm] = useState<RuleInput>(() => fromRule(rule, template, account?.igUserId ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(form.excludeKeywords.length > 0 || form.matchMode === 'contains');
  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const allMedia: Media[] = useMemo(() => media.data?.accounts.flatMap((a) => a.media) ?? [], [media.data]);
  const selected = allMedia.find((m) => m.id === form.mediaId) ?? rule?.media ?? null;

  const save = useMutation({
    mutationFn: () => {
      const input = {
        ...form,
        igUserId: form.igUserId || account?.igUserId || '',
        label: form.label.trim() || autoLabel(form, selected),
      };
      return rule ? api.updateRule(rule.id, input) : api.createRule(input);
    },
    onSuccess: (r) => {
      toast.success(rule ? 'Saved' : 'Automation created', { description: `“${r.rule.label}” applies to new comments right away.` });
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['media'] });
      onDone();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error('Not saved', { description: e.message });
    },
  });

  const links = useMemo(() => form.dmText.match(/https?:\/\/\S+/g) ?? [], [form.dmText]);
  const canSave = (form.matchAll || form.keywords.length > 0) && form.dmText.trim().length > 0;

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_380px]">
      <form
        className="space-y-8 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-[13.5px] text-danger" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <Step n={1} title="Which reel?" hint="Tie it to one reel so FIFA on the FIFA reel gets the FIFA guide.">
          <PostPicker media={allMedia} loading={media.isLoading} value={form.mediaId} onChange={(id) => set('mediaId', id)} onRefresh={() => qc.fetchQuery({ queryKey: ['media'], queryFn: () => api.media(true) })} />
        </Step>

        <Step n={2} title="Trigger words" hint="Any one of these in a comment sends the DM. Capitals, emoji and punctuation don’t matter.">
          {form.mediaId ? (
            <label className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-[13.5px]">
              <Switch checked={form.matchAll} onCheckedChange={(v) => set('matchAll', v)} />
              <span>
                <span className="font-medium">Reply to every comment on this reel</span>
                <span className="block text-xs text-fg-muted">No keyword needed — good for giveaways.</span>
              </span>
            </label>
          ) : null}
          {!form.matchAll ? (
            <ChipInput values={form.keywords} onChange={(v) => set('keywords', v)} placeholder="Type a word and press Enter — e.g. FIFA" ariaLabel="Trigger words" />
          ) : null}
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
            <ChevronDown className={cn('size-4 transition-transform', showAdvanced && 'rotate-180')} /> Matching options
          </button>
          <AnimatePresence initial={false}>
            {showAdvanced ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 space-y-4 rounded-xl border border-border p-4">
                  <div role="radiogroup" aria-label="How to match" className="grid gap-2 sm:grid-cols-2">
                    <Choice active={form.matchMode === 'word'} onClick={() => set('matchMode', 'word')} title="Whole word" body="“fifa pls” matches, “fifaaa” doesn’t. Recommended." />
                    <Choice active={form.matchMode === 'contains'} onClick={() => set('matchMode', 'contains')} title="Anywhere" body="Also matches inside hashtags and longer words." />
                  </div>
                  <Field label="Never reply when a comment includes" hint="Optional. For example: spam, scam.">
                    <ChipInput values={form.excludeKeywords} onChange={(v) => set('excludeKeywords', v)} placeholder="Add an excluded word" ariaLabel="Excluded words" />
                  </Field>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Step>

        <Step n={3} title="The DM" hint="Sent privately to the person who commented. Non-followers find it in Message requests.">
          <div className="relative">
            <Textarea value={form.dmText} onChange={(e) => set('dmText', e.target.value.slice(0, DM_MAX))} rows={7} aria-label="DM text" className="pb-9" />
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
                onClick={() => set('dmText', `${form.dmText}{username}`)}
              >
                <AtSign className="size-3.5" /> Insert name
              </button>
              <span className={cn('text-xs tabular', form.dmText.length > DM_MAX * 0.9 ? 'text-warning' : 'text-fg-subtle')}>
                {form.dmText.length}/{DM_MAX}
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {links.length ? (
              links.map((l) => (
                <span key={l} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-success-soft px-2 py-1 text-xs text-success">
                  <Link2 className="size-3.5 shrink-0" />
                  <span className="truncate">{l.replace(/^https?:\/\//, '').slice(0, 48)}</span>
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-xs text-warning">
                <AlertCircle className="size-3.5" /> No link in the DM yet — paste your Google Drive link.
              </span>
            )}
          </div>
        </Step>

        <Step n={4} title="Public reply" hint="Posted under their comment. The bot picks one at random so it doesn’t look copy-pasted. Leave all empty to skip.">
          <div className="space-y-2">
            {form.publicReplies.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={r}
                  maxLength={REPLY_MAX}
                  onChange={(e) => set('publicReplies', form.publicReplies.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`Public reply ${i + 1}`}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => set('publicReplies', form.publicReplies.filter((_, j) => j !== i))} aria-label="Remove reply">
                  <X />
                </Button>
              </div>
            ))}
            {form.publicReplies.length < 5 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => set('publicReplies', [...form.publicReplies, ''])}>
                <Plus /> Add a variation
              </Button>
            ) : null}
          </div>
        </Step>

        <Step n={5} title="Name" hint="Only you see this.">
          <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={autoLabel(form, selected)} aria-label="Automation name" />
        </Step>

        <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!canSave}>
            <Check /> {rule ? 'Save changes' : 'Create automation'}
          </Button>
        </div>
      </form>

      <aside className="border-t border-border bg-bg-subtle p-6 lg:border-l lg:border-t-0">
        <div className="lg:sticky lg:top-6">
          <Preview form={form} media={selected} username={account?.username ?? 'you'} />
        </div>
      </aside>
    </div>
  );
}

function autoLabel(form: RuleInput, media: Media | null): string {
  const kw = form.keywords[0]?.toUpperCase();
  if (form.matchAll) return media ? `Every comment · ${media.caption.slice(0, 24)}` : 'Every comment';
  return kw ? `${kw} ${media ? 'reel' : 'everywhere'}` : 'New automation';
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 sm:grid-cols-[28px_1fr]">
      <div className="hidden size-7 place-items-center rounded-full bg-fg text-[12px] font-semibold text-bg sm:grid">{n}</div>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mb-3 mt-0.5 text-[13px] text-fg-muted">{hint}</p>
        {children}
      </div>
    </section>
  );
}

function Choice({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn('rounded-xl border p-3 text-left transition-colors', active ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}
    >
      <div className="flex items-center gap-2 text-[13.5px] font-medium">
        <span className={cn('grid size-4 place-items-center rounded-full border', active ? 'border-accent bg-accent' : 'border-border-strong')}>
          {active ? <span className="size-1.5 rounded-full bg-accent-fg" /> : null}
        </span>
        {title}
      </div>
      <p className="mt-1 pl-6 text-xs text-fg-muted">{body}</p>
    </button>
  );
}

function ChipInput({ values, onChange, placeholder, ariaLabel }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; ariaLabel: string }) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div
      onClick={() => ref.current?.focus()}
      className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-sm focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15"
    >
      {values.map((v) => (
        <span key={v} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft pl-2.5 pr-1 text-[13px] font-semibold uppercase tracking-wide text-accent">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded p-0.5 hover:bg-accent/15" aria-label={`Remove ${v}`}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => commit(draft)}
        placeholder={values.length ? 'Add another…' : placeholder}
        aria-label={ariaLabel}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-[14px] outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}

function PostPicker({ media, loading, value, onChange, onRefresh }: { media: Media[]; loading: boolean; value: string | null; onChange: (id: string | null) => void; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? media : media.slice(0, 8);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <PostTile active={value === null} onClick={() => onChange(null)} label="All posts" sub="Any post or reel">
          <div className="grid size-full place-items-center bg-accent-soft text-accent">
            <Globe2 className="size-7" />
          </div>
        </PostTile>
        {loading
          ? Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-xl" />)
          : shown.map((m) => (
              <PostTile key={m.id} active={value === m.id} onClick={() => onChange(m.id)} label={m.caption} sub={m.usedBy && value !== m.id ? `Used by ${m.usedBy}` : m.kind === 'reel' ? 'Reel' : 'Post'} warn={!!m.usedBy && value !== m.id}>
                <MediaThumb media={m} className="size-full rounded-none ring-0" />
              </PostTile>
            ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        {media.length > 8 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Show fewer' : `Show all ${media.length}`}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw /> Refresh posts
        </Button>
      </div>
    </div>
  );
}

function PostTile({ active, onClick, label, sub, warn, children }: { active: boolean; onClick: () => void; label: string; sub: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('group overflow-hidden rounded-xl border bg-surface text-left transition-all', active ? 'border-accent ring-4 ring-accent/15' : 'border-border hover:border-border-strong')}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        {children}
        {active ? (
          <div className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-accent-fg shadow">
            <Check className="size-3.5" />
          </div>
        ) : null}
      </div>
      <div className="p-2">
        <div className="truncate text-[12px] font-medium">{label}</div>
        <div className={cn('truncate text-[11px]', warn ? 'text-warning' : 'text-fg-subtle')}>{sub}</div>
      </div>
    </button>
  );
}

function Preview({ form, media, username }: { form: RuleInput; media: Media | null; username: string }) {
  const [sample, setSample] = useState(() => (form.keywords[0] ? `${form.keywords[0].toLowerCase()} pls 🙏` : 'guide please!'));
  const verdict = form.matchAll ? { hit: '(every comment)', blockedBy: null } : previewMatch(sample, form.keywords, form.excludeKeywords, form.matchMode);
  const willSend = !!verdict.hit && !verdict.blockedBy;
  const dm = form.dmText.replaceAll('{username}', 'sample_user');
  const reply = form.publicReplies.find((r) => r.trim()) ?? '';
  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="size-4 text-accent" /> Try a comment
        </h3>
        <p className="mt-0.5 text-xs text-fg-muted">Type what a follower might write. This uses the bot’s exact matching.</p>
        <Input value={sample} onChange={(e) => setSample(e.target.value)} className="mt-2" aria-label="Sample comment" />
        <div
          className={cn(
            'mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]',
            willSend ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted',
          )}
          aria-live="polite"
        >
          {willSend ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span>
            {verdict.blockedBy
              ? `Matches “${verdict.hit}”, but “${verdict.blockedBy}” is excluded — no DM.`
              : willSend
                ? `Sends the DM (matched “${verdict.hit}”).`
                : form.keywords.length
                  ? 'No trigger word — this comment is ignored.'
                  : 'Add a trigger word to see what matches.'}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-md">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="ig-gradient size-7 rounded-full p-[2px]">
            <div className="size-full rounded-full bg-surface" />
          </div>
          <div className="text-[13px] font-semibold">{username}</div>
          {media ? <MediaThumb media={media} className="ml-auto size-8 rounded-md" /> : null}
        </div>
        <div className="space-y-3 px-4 py-3 text-[13px]">
          <div className="flex gap-2">
            <div className="size-6 shrink-0 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500" />
            <div>
              <span className="font-semibold">sample_user</span> <span className="text-fg/90">{sample || '…'}</span>
              {willSend && reply ? (
                <div className="mt-2 flex gap-2">
                  <div className="ig-gradient size-5 shrink-0 rounded-full" />
                  <div>
                    <span className="font-semibold">{username}</span> <span className="text-fg/90">@sample_user {reply}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-bg-subtle px-4 py-3">
          <div className="mb-2 text-center text-[11px] text-fg-subtle">Direct message · Requests</div>
          <AnimatePresence mode="wait">
            {willSend ? (
              <motion.div key="dm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-500 px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-sm">
                  {dm.trim() || '…'}
                </div>
              </motion.div>
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-4 text-center text-xs text-fg-subtle">
                No DM for this comment
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
