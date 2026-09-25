import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * The gallery's shape while the roster is on the wire.
 *
 * This is the page the installed app opens on, and it sits outside the
 * planner group whose loading states the other sections share, so it had none:
 * a launch drew nothing until every query had answered. The title, the tabs,
 * the grouping strip and a grid of portrait cards at the gallery's own sizes,
 * so the roster lands into the shape already on screen.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-full max-w-md" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
