import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, side }: { title: string; description?: ReactNode; children: ReactNode; className?: string; side?: 'center' | 'right' }) {
  const right = side === 'right';
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <D.Content
        className={cn(
          'fixed z-50 bg-surface shadow-lg outline-none border-border',
          right
            ? 'inset-y-0 right-0 w-full max-w-[min(960px,100vw)] border-l flex flex-col data-[state=open]:animate-[slide-in_220ms_cubic-bezier(.2,.8,.2,1)]'
            : 'left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 data-[state=open]:animate-[pop-in_160ms_ease-out]',
          className,
        )}
      >
        <div className={cn('flex items-start justify-between gap-4', right && 'border-b border-border px-6 py-4')}>
          <div className="space-y-1">
            <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="text-sm text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className={cn(right ? 'flex-1 overflow-y-auto scrollbar-thin' : 'mt-4')}>{children}</div>
      </D.Content>
    </D.Portal>
  );
}
