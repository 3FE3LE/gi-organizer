'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * A section that folds away on a phone and is simply open everywhere else.
 *
 * The attribute table is ten rows the width of a phone, and on the build
 * screen it sat between the portrait and everything the player came to change —
 * a full screen of numbers to scroll past before the weapon. Folded by default
 * below `sm`, it is one line that opens on a tap; from `sm` up there is room,
 * so it is a plain heading and the rows are always there.
 *
 * CSS decides the width, not script: the closed state is `max-sm:hidden`, so
 * the server's HTML is already right at both widths and nothing jumps on
 * hydration.
 */
export function MobileCollapsible({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <h2 className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-muted sm:block">
        {title}
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted sm:hidden"
      >
        {title}
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={id} className={open ? undefined : 'max-sm:hidden'}>
        {children}
      </div>
    </div>
  );
}
