import Link from 'next/link';

import { HoverLabel } from '@/components/hint';

/**
 * The label every group of filter values carries, above the values: one
 * drawing for the question a row of chips or a strip of segments answers.
 */
export const GROUP_LABEL = 'font-mono text-2xs uppercase tracking-wide text-muted';

/** A segment's own look: filled when it is the current one. */
function segmentClass(active: boolean) {
  return `flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs transition-colors ${
    active ? 'bg-accent font-medium text-on-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
  }`;
}

/**
 * A choice of one, as a row of links in one bordered strip.
 *
 * The filters on the artifacts page and the grouping on the roster are the
 * same kind of control — pick one of a few ways to see a list, and the choice
 * is the URL — so they are the same drawing: a label above, one strip whose
 * parts are hairline divided so they read as one choice of several rather
 * than several things to think about, and the current one filled.
 */
export function Segments({
  label,
  hint,
  children,
}: {
  label: string;
  /** What the group means, for the pointer that asks. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // `min-w-0` and a sideways scroll, so a group wider than a phone — the
    // seven orderings — slides rather than pushing the card past the screen.
    // `relative` here, outside that scroll, is what a segment's hover label is
    // placed against — see `Segment`.
    <div className="relative min-w-0 max-w-full space-y-0.5">
      {/* The hint rides on the strip's own name, where a screen reader and a
          keyboard both meet it; a `title` on a label nothing can focus reached
          neither. */}
      <p aria-hidden className={GROUP_LABEL}>{label}</p>
      <SegmentStrip label={hint ? `${label}: ${hint}` : label}>{children}</SegmentStrip>
    </div>
  );
}

/** The bordered strip alone, for a strip whose label sits elsewhere. */
export function SegmentStrip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit max-w-full items-stretch divide-x divide-edge overflow-x-auto rounded-lg border border-edge bg-surface-2/50"
    >
      {children}
    </div>
  );
}

/**
 * A group of filter values under its label — the chips of one question, the
 * same label style `Segments` has, always above rather than beside them.
 */
export function FilterGroup({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={`min-w-0 space-y-1 ${className}`}>
      <p aria-hidden className={GROUP_LABEL}>{label}</p>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function Segment({
  to,
  active,
  title,
  scroll,
  children,
}: {
  to: string;
  active: boolean;
  title?: string;
  /** `false` keeps the page where it is, for a regrouping of the same list. */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      scroll={scroll}
      aria-current={active ? 'true' : undefined}
      className={`${segmentClass(active)}${title ? ' group/segment' : ''}`}
    >
      {children}
      {/* A segment is a link, so its hint is the CSS label rather than a
          tooltip — see `components/hint.tsx`. The segment is deliberately not
          `relative`: the strip scrolls sideways, and a scroller clips whatever
          is placed against something inside it, so a label anchored to the
          segment would be cut off above the strip. It is placed against the
          group around the strip instead, and hangs below it: above, it would
          land on the group's name, and a folded panel clips what rises out of
          its top. Its own named group, because these strips sit inside cards
          that are a `group` of their own. */}
      {title && <HoverLabel text={title} side="bottom" scope="segment" />}
    </Link>
  );
}

/**
 * A segment that is a button rather than a link, for a choice held in the
 * page instead of the URL — the same drawing, so a strip reads as one kind of
 * control wherever it is.
 */
export function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={segmentClass(active)}>
      {children}
    </button>
  );
}

