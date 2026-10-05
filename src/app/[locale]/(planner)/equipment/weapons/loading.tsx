import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * The weapons: their counts, the controls card — the type strip and the
 * search over the folded "more filters" — and a grid of cards at the page's
 * own columns.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <Skeleton className="h-3 w-48" />
        <div className="card">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 p-3">
            <div className="grid w-full grid-cols-5 gap-1 sm:flex sm:w-auto">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-11 rounded-lg sm:h-9 sm:w-11" />
              ))}
            </div>
            <Skeleton className="h-9 w-full rounded-lg sm:w-auto sm:min-w-64 sm:flex-1" />
          </div>
          <div className="border-t border-edge px-3 py-2">
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 9 }, (_, index) => (
            <li key={index}><Skeleton className="h-48 rounded-[var(--radius-card)]" /></li>
          ))}
        </ul>
      </div>
    </LoadingRegion>
  );
}
