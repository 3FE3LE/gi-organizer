'use client';

import { Popover } from '@base-ui/react/popover';
import { CircleHelp, X } from 'lucide-react';

/**
 * The app's one "what does this mean": a `?` that opens a legend.
 *
 * A toggletip rather than a tooltip. A tooltip only opens under a mouse, so on
 * a phone the meaning of every mark was out of reach, and a tooltip is for
 * the name of a thing, not for the key to a whole card. This opens on a click
 * or a tap, stays open while it is read, and closes on Escape, on the ×, or
 * anywhere outside it. The legend inside may be a server component.
 *
 * One component on every surface that draws marks instead of words — the
 * artifact card, the roster, the plan — so the way to find out what a mark
 * means is the same everywhere: look for the `?` next to the heading.
 */
export function HelpTip({
  label,
  text,
  title,
  closeLabel,
  side = 'bottom',
  align = 'start',
  children,
}: {
  /** What the button is for, said to a screen reader and on hover. */
  label: string;
  /**
   * Written beside the `?`, for a legend that should be found by someone who
   * is not looking for it — the first surface a new player lands on.
   */
  text?: string;
  /** The legend's heading. */
  title: string;
  closeLabel: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={text ? undefined : label}
        title={label}
        // 24 px at least: the smallest target WCAG allows, on a mark that is
        // drawn at 14.
        className={`inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-popup-open:text-accent ${
          text ? 'px-1 text-xs normal-case tracking-normal' : 'w-6'
        }`}
      >
        <CircleHelp size={14} aria-hidden />
        {text}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup className="panel max-h-(--available-height) w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain origin-(--transform-origin) rounded-lg p-3 text-xs shadow-[var(--shadow-raised)] outline-none transition-[opacity,scale] duration-(--duration-enter) ease-(--ease-out-soft) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Popover.Title className="font-mono text-2xs uppercase tracking-wide text-muted">
                {title}
              </Popover.Title>
              <Popover.Close
                aria-label={closeLabel}
                className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-text"
              >
                <X size={14} aria-hidden />
              </Popover.Close>
            </div>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * One line of a legend: the mark as it is drawn, and what it means.
 *
 * The mark column is fixed so the explanations line up, whatever the width of
 * the mark beside them.
 */
export function HelpRow({ mark, children }: { mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex w-16 shrink-0 items-center justify-end gap-1 pt-px font-mono text-2xs">{mark}</span>
      <span className="leading-snug text-text">{children}</span>
    </li>
  );
}

/** A group of rows under a small heading, for a legend with several parts. */
export function HelpSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 not-first:mt-3 not-first:border-t not-first:border-edge not-first:pt-3">
      {title && <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">{title}</h3>}
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}
