import type { ReactNode } from 'react';
import type { Tone } from '@/lib/types';
import { cn } from '@/lib/utils';

const tones: Record<Tone | 'neutral' | 'accent', string> = {
  success: 'bg-success-soft text-success',
  pending: 'bg-pending-soft text-pending',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-surface-2 text-fg-muted',
  neutral: 'bg-surface-2 text-fg-muted border border-border',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: keyof typeof tones; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
