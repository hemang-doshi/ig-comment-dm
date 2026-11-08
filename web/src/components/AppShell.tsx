import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Activity, LayoutDashboard, Moon, Plus, Search, Settings, Sparkles, Sun, Monitor, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Kbd, StatusDot } from '@/components/ui/misc';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, key: 'o' },
  { to: '/activity', label: 'Activity', icon: Activity, key: 'a' },
  { to: '/automations', label: 'Automations', icon: Zap, key: 'u' },
  { to: '/settings', label: 'Settings', icon: Settings, key: 's' },
];

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('ig-gradient grid size-8 place-items-center rounded-[10px] text-white shadow-md', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 20l1.1-4A8.4 8.4 0 1 1 21 11.5Z" />
        <path d="m9 11 2 2 4-4" />
      </svg>
    </div>
  );
}

function useStatus() {
  return useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 20_000 });
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useStatus();

  // Keyboard: ⌘K palette, and g-then-letter to jump between pages.
  useEffect(() => {
    let pendingG = false;
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, [contenteditable=true]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'g') {
        pendingG = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (pendingG = false), 800);
        return;
      }
      if (pendingG) {
        const hit = NAV.find((n) => n.key === e.key);
        if (hit) navigate(hit.to);
        pendingG = false;
      } else if (e.key === 'n') {
        navigate('/automations/new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const tone = !data ? 'pending' : data.state === 'ok' ? 'success' : data.state === 'attention' ? 'danger' : data.state === 'paused' ? 'warning' : 'pending';
  const statusText = !data ? 'Checking…' : data.state === 'ok' ? 'Live' : data.state === 'paused' ? 'Paused by Meta' : data.state === 'busy' ? 'Catching up' : 'Needs attention';

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg-subtle/80 backdrop-blur md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <Logo />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tight">Comment DM</div>
            <div className="text-xs text-fg-muted">@{data?.accounts[0]?.username ?? '…'}</div>
          </div>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] text-fg-subtle shadow-sm hover:text-fg-muted"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search or jump…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                  isActive ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-fg-muted hover:bg-surface/70 hover:text-fg',
                )
              }
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/activity' && data && data.queue.waiting > 0 ? (
                <span className="rounded-full bg-pending-soft px-1.5 text-[11px] font-semibold text-pending tabular">{data.queue.waiting}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <StatusDot tone={tone} />
            {statusText}
          </div>
          <p className="mt-1 line-clamp-3 text-xs text-fg-muted">{data?.headline ?? 'Loading status…'}</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur md:hidden">
        <Logo className="size-7 rounded-[9px]" />
        <div className="flex-1 text-[15px] font-semibold tracking-tight">Comment DM</div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium">
          <StatusDot tone={tone} />
          {statusText}
        </div>
      </header>

      <main className="md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10 lg:px-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-fg' : 'text-fg-subtle')}
          >
            <n.icon className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [, setTheme] = useTheme();
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: api.rules, enabled: open });
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-fg-subtle" />
        <Command.Input placeholder="Type a command or search…" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle" />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
        <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">Nothing matches.</Command.Empty>
        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
          {NAV.map((n) => (
            <PaletteItem key={n.to} onSelect={() => go(n.to)} icon={<n.icon />} hint={`G ${n.key.toUpperCase()}`}>
              {n.label}
            </PaletteItem>
          ))}
        </Command.Group>
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
          <PaletteItem onSelect={() => go('/automations/new')} icon={<Plus />} hint="N">
            New automation
          </PaletteItem>
          <PaletteItem onSelect={() => go('/activity?status=problem')} icon={<Sparkles />}>
            Show comments that need attention
          </PaletteItem>
          <PaletteItem onSelect={() => (setTheme('light'), onOpenChange(false))} icon={<Sun />}>
            Light theme
          </PaletteItem>
          <PaletteItem onSelect={() => (setTheme('dark'), onOpenChange(false))} icon={<Moon />}>
            Dark theme
          </PaletteItem>
          <PaletteItem onSelect={() => (setTheme('system'), onOpenChange(false))} icon={<Monitor />}>
            Match system theme
          </PaletteItem>
        </Command.Group>
        {rules?.rules.length ? (
          <Command.Group heading="Automations" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
            {rules.rules.map((r) => (
              <PaletteItem key={r.id} onSelect={() => go(`/automations/${r.id}`)} icon={<Zap />} value={`${r.label} ${r.keywords.join(' ')}`}>
                {r.label}
                <span className="ml-2 text-fg-subtle">{r.keywords.join(', ')}</span>
              </PaletteItem>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({ children, icon, hint, onSelect, value }: { children: React.ReactNode; icon: React.ReactNode; hint?: string; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={value}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[14px] text-fg-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg [&_svg]:size-4"
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-[11px] text-fg-subtle">{hint}</span> : null}
    </Command.Item>
  );
}
