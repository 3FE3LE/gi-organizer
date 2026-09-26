import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * The box: the title and its counts, the filter card — the set strip over the
 * folded "more filters" — and the grid of cards at the page's own columns.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="card">
          <div className="space-y-2 px-3 pb-3 pt-2.5">
            <Skeleton className="h-3 w-10" />
            <div className="flex gap-1.5 overflow-hidden">
              {Array.from({ length: 14 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-11 shrink-0 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="border-t border-edge px-3 py-2">
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <li key={index}><Skeleton className="h-52 rounded-[var(--radius-card)]" /></li>
          ))}
        </ul>
      </div>
    </LoadingRegion>
  );
}
