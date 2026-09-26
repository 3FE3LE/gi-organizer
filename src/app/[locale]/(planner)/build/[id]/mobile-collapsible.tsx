'use client';

import { useId, useState } from 'react';

import { Collapse } from '@/components/collapse';
import { FoldMark } from '@/components/fold-mark';

/**
 * A section that folds away on a phone and is simply open everywhere else.
 *
 * The attribute table is ten rows the width of a phone, and on the build
 * screen it sat between the portrait and everything the player came to change —
 * a full screen of numbers to scroll past before the weapon. Folded by default
 * below `sm`, it is one line that opens on a tap; from `sm` up there is room,
 * so it is a plain heading and the rows are always there.
 *
 * CSS decides the width, not script: from `sm` up the fold is forced open by
 * class, so the server's HTML is already right at both widths and nothing
 * jumps on hydration.
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
      <h2 className="mb-2 hidden text-sm font-medium uppercase tracking-wide text-muted sm:block">
        {title}
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium uppercase tracking-wide text-muted sm:hidden"
      >
        {title}
        <FoldMark open={open} />
      </button>
      <Collapse open={open} id={id} className="sm:visible sm:grid-rows-[1fr]">
        {children}
      </Collapse>
    </div>
  );
}
