import { getTranslations } from 'next-intl/server';

/**
 * The shapes a page holds while its data is still on the wire.
 *
 * Every planner route reads the player's database, so every one of them is
 * `force-dynamic` and none of them could be prerendered. Without a fallback
 * that means a click on the nav leaves the old page on screen, untouched, for
 * as long as the query takes — the browser's own spinner is the only sign that
 * anything happened. A skeleton is not decoration here: it is the difference
 * between a tool that answers and a tool that appears to have ignored you.
 *
 * The blocks are the app's own surfaces at the app's own sizes, so the shell
 * that arrives first is the shape the content lands into rather than a grey
 * rectangle that jumps when it is replaced.
 */

/** One block. `aria-hidden` because the region around it does the announcing. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded bg-surface-2 motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Announces that something is coming, once, for a reader that cannot see the
 * blocks pulse.
 *
 * `role="status"` rather than an alert: a page loading is not an interruption,
 * and `aria-busy` is what tells assistive tech the subtree is not final yet.
 */
export async function LoadingRegion({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('ui');

  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  );
}

/** A toolbar of chips: the filter surfaces that sit above most lists. */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-8 w-24" />
    </div>
  );
}

/** A grid of cards, at the density the artifact and character pages use. */
export function CardGridSkeleton({
  count = 8,
  className = 'sm:grid-cols-2 xl:grid-cols-3',
  height = 'h-28',
}: {
  count?: number;
  className?: string;
  height?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={height} />
      ))}
    </div>
  );
}

/** Stacked panels, for the pages that are a column of sections. */
export function PanelsSkeleton({ count = 3, height = 'h-24' }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={height} />
      ))}
    </div>
  );
}
