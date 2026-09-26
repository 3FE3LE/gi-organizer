import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * The gallery's shape while the roster is on the wire.
 *
 * It sits outside the planner group whose loading states the other sections
 * share, so it had none: a visit drew nothing until every query had answered.
 * The title, the tabs, the controls card — search, the two strips, the chip
 * row — and a grid of portrait cards at the gallery's own sizes, so the roster
 * lands into the shape already on screen.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-56" />
        <div className="card flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <Skeleton className="h-9 w-full rounded-lg sm:w-64" />
            <Skeleton className="h-8 w-80 max-w-full rounded-lg" />
            <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
          </div>
          <Skeleton className="h-7 w-full max-w-2xl rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
