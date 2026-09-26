import { X } from 'lucide-react';
import Link from 'next/link';

import { GROUP_LABEL } from '@/components/segmented-links';

export type ActiveFilter = {
  key: string;
  label: string;
  /** An emblem or icon before the label, as the control that set it showed. */
  icon?: React.ReactNode;
  /** The same view with this one filter taken off. */
  to: string;
};

/**
 * What is narrowing a list, each one a tap from undoing, and all of them at
 * once — one drawing on every page that filters.
 *
 * Shown where the controls that set them are out of sight: on a docked bar,
 * which folds its rows away, and under a folded "more filters". A page that
 * has its controls open already shows what they picked, and leaves this out.
 */
export function ActiveFilters({
  items,
  clear,
  labels,
  className = '',
}: {
  items: ActiveFilter[];
  /** Everything off at once; null when a single chip already is that. */
  clear: string | null;
  labels: { title: string; clear: string; remove: (name: string) => string };
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={GROUP_LABEL}>{labels.title}</span>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.to}
          scroll={false}
          data-active
          aria-label={labels.remove(item.label)}
          className="chip gap-1"
        >
          {item.icon}
          {item.label}
          <X size={12} aria-hidden />
        </Link>
      ))}
      {clear && items.length > 1 && (
        <Link
          href={clear}
          scroll={false}
          className="font-mono text-2xs text-muted underline decoration-edge-strong underline-offset-2 hover:text-accent"
        >
          {labels.clear}
        </Link>
      )}
    </div>
  );
}
