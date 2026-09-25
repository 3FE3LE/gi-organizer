'use client';

import { useState } from 'react';

/**
 * A region that folds and unfolds instead of appearing and vanishing.
 *
 * Height cannot transition to `auto`, but a one-row grid can go from `0fr` to
 * `1fr`, and the row takes its content's height on the way — no measuring, no
 * script. Closed, the content stays in the tree so it can fold shut rather
 * than be cut out mid-animation, and `visibility: hidden` keeps it out of tab
 * order and the accessibility tree. Not `inert`: an attribute cannot be undone
 * by a media query, and a fold that is always open from `sm` up needs that.
 *
 * `lazy` mounts the content on its first open and keeps it after, for a list
 * of rows each with a fold that most will never open.
 */
export function Collapse({
  open,
  id,
  lazy = false,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  lazy?: boolean;
  /** On the grid: extra states, such as always open from `sm` up. */
  className?: string;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(open);
  // Set during render, not from an effect: the first open must already have
  // the content in the frame it starts unfolding.
  if (open && !opened) setOpened(true);

  return (
    <div
      id={id}
      data-open={open ? '' : undefined}
      className={`collapse-grid ${className ?? ''}`}
    >
      <div className="min-h-0 overflow-hidden">{lazy && !opened ? null : children}</div>
    </div>
  );
}
