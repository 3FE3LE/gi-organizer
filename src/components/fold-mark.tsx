import { ChevronRight } from 'lucide-react';

/**
 * The mark on anything that folds: a chevron pointing at what it hides,
 * turning down once it is open. One size, one colour, one motion across the
 * app — it was seven marks before, from a rotating plus to a hand-drawn arrow.
 *
 * Inside a `Fold` it follows the trigger's own open state through the group
 * named here, so it needs no state; a fold driven by React passes `open`. The
 * group is `group/trigger`, not a bare `group`: a bare one would also light
 * every hover label inside the fold whenever the pointer is anywhere on it.
 */
const GROUPS = {
  /** Inside a `Fold`: its trigger says when its own panel is open, and only
      its own, so a fold nested in an open one stays shut-looking. */
  trigger: 'group-data-panel-open/trigger:rotate-90',
} as const;

export function FoldMark({
  group = 'trigger',
  open,
  className = '',
}: {
  /** Which `group` the surrounding trigger is, when there is one. */
  group?: keyof typeof GROUPS;
  /** For a fold with no `Fold`: whether it is open. */
  open?: boolean;
  className?: string;
}) {
  const turn = open === undefined ? GROUPS[group] : open ? 'rotate-90' : '';
  return (
    <ChevronRight
      size={12}
      aria-hidden
      className={`shrink-0 text-muted transition-transform ${turn} ${className}`}
    />
  );
}
