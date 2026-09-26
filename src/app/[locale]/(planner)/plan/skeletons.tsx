import { Skeleton } from '@/components/skeleton';

/**
 * The plan's own shapes, for the moments before its data arrives.
 *
 * Drawn from the surfaces they stand in for — the day card, the filter bar
 * with its seven days, a domain's header over its icons — so what lands
 * replaces them in place instead of pushing the page about.
 */

export function TodayCardSkeleton() {
  return (
    <div className="card space-y-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <span className="flex -space-x-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-9 rounded-full ring-2 ring-surface" />
          ))}
        </span>
      </div>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1 sm:gap-3">
        <span className="flex flex-1 gap-1">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-[52px] w-9 rounded-xl sm:w-10" />
          ))}
        </span>
        <Skeleton className="h-[52px] w-10 rounded-xl sm:h-8 sm:w-16" />
      </div>
      <Skeleton className="h-9 rounded-xl" />
    </div>
  );
}

/** A domain card: the name over a row of material icons and faces. */
export function DomainCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-60" />
      <div className="space-y-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="card">
            <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex gap-2 px-3 py-3">
              {Array.from({ length: 3 }, (_, icon) => (
                <Skeleton key={icon} className="h-11 w-11" />
              ))}
              <span className="w-2" />
              {Array.from({ length: 4 }, (_, face) => (
                <Skeleton key={face} className="h-11 w-11" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
