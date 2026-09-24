import Link from 'next/link';

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
    <div className="min-w-0 max-w-full space-y-0.5">
      <p aria-hidden title={hint} className="font-mono text-2xs uppercase tracking-wide text-muted">{label}</p>
      <div
        role="group"
        aria-label={hint ? `${label}: ${hint}` : label}
        className="flex w-fit max-w-full items-stretch divide-x divide-edge overflow-x-auto rounded-lg border border-edge bg-surface-2/50 [scrollbar-width:none]"
      >
        {children}
      </div>
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
      title={title}
      scroll={scroll}
      aria-current={active ? 'true' : undefined}
      className={`flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs transition-colors ${
        active
          ? 'bg-accent font-medium text-on-accent'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}

