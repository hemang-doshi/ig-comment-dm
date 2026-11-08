import { useState } from 'react';
import { Clapperboard, Globe2, Image as ImageIcon } from 'lucide-react';
import type { Media } from '@/lib/types';
import { cn } from '@/lib/utils';

/** A post's thumbnail, falling back to an icon when Instagram's signed URL has expired or there is none. */
export function MediaThumb({ media, className, all }: { media: Media | null | undefined; className?: string; all?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (all || !media) {
    return (
      <div className={cn('grid size-12 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent [&_svg]:size-1/2', className)} aria-hidden>
        <Globe2 />
      </div>
    );
  }
  if (!media.thumbnail || broken) {
    return (
      <div className={cn('grid size-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-subtle [&_svg]:size-1/2', className)} aria-hidden>
        {media.kind === 'reel' ? <Clapperboard /> : <ImageIcon />}
      </div>
    );
  }
  return (
    <img
      src={media.thumbnail}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn('size-12 shrink-0 rounded-lg bg-surface-2 object-cover ring-1 ring-border', className)}
    />
  );
}
