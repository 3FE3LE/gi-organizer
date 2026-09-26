import { ChevronRight } from 'lucide-react';

/**
 * The mark on anything that folds: a chevron pointing at what it hides,
 * turning down once it is open. One size, one colour, one motion across the
 * app — it was seven marks before, from a rotating plus to a hand-drawn arrow.
 *
 * Inside a `<details>` it follows the element's own `open` through the group
 * named here, so it needs no state; a fold driven by React passes `open`.
 */
const GROUPS = {
  details: 'group-open:rotate-90',
  legend: 'group-open/legend:rotate-90',
  missing: 'group-open/missing:rotate-90',
} as const;

export function FoldMark({
  group = 'details',
  open,
  className = '',
}: {
  /** Which `group` the surrounding `<details>` is, when there is one. */
  group?: keyof typeof GROUPS;
  /** For a fold with no `<details>`: whether it is open. */
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
