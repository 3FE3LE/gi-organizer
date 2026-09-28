import Link from 'next/link';

import { HoverLabel } from '@/components/hint';

/**
 * The label every group of filter values carries, above the values: one
 * drawing for the question a strip of segments answers.
 */
export const GROUP_LABEL = 'font-mono text-2xs uppercase tracking-wide text-muted';

/**
 * A segment's own look: filled when it is the current one.
 *
 * The resting fill is opaque — the card's surface half mixed toward the second
 * one, which is what the strip's translucent tint used to paint — because the
 * hairlines between segments are now the strip's own edge colour showing
 * through a one-pixel gap, and a translucent segment would let it through.
 */
function segmentClass(active: boolean) {
  return `flex min-h-8 grow items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-xs transition-colors ${
    active
      ? 'bg-accent font-medium text-on-accent'
      : 'bg-[color-mix(in_oklab,var(--surface-2)_50%,var(--surface))] text-muted hover:bg-surface-2 hover:text-text'
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
    // `min-w-0`, so a group wider than a phone wraps inside the card rather
    // than pushing it past the screen. `relative` is what a segment's hover
    // label is placed against — see `Segment`.
    <div className="relative min-w-0 max-w-full space-y-0.5">
      {/* The hint rides on the strip's own name, where a screen reader and a
          keyboard both meet it; a `title` on a label nothing can focus reached
          neither. */}
      <p aria-hidden className={GROUP_LABEL}>{label}</p>
      <SegmentStrip label={hint ? `${label}: ${hint}` : label}>{children}</SegmentStrip>
    </div>
  );
}

/**
 * The bordered strip alone, for a strip whose label sits elsewhere.
 *
 * It wraps rather than scrolling. A strip that slid sideways hid its last
 * values off the card on a phone — six groupings, seven orderings — which is
 * why those used to be chips. Wrapped, the hairlines are a one-pixel gap over
 * the edge colour, so they divide a second row as they do the first, and each
 * segment grows to fill its row so no gap is left showing at a row's end.
 */
export function SegmentStrip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap items-stretch gap-px overflow-hidden rounded-lg border border-edge bg-edge"
    >
      {children}
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
      data-active={active}
      className={`${segmentClass(active)}${title ? ' group/segment' : ''}`}
    >
      {children}
      {/* A segment is a link, so its hint is the CSS label rather than a
          tooltip — see `components/hint.tsx`. The segment is deliberately not
          `relative`: the strip clips to its rounded corners, and that clips
          whatever is placed against something inside it, so a label anchored to the
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
    <button type="button" onClick={onClick} aria-pressed={active} data-active={active} className={segmentClass(active)}>
      {children}
    </button>
  );
}

