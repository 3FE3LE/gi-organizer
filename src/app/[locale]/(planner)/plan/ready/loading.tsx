import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** The tab's shape: three counts, then the lists. */

export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-2 sm:max-w-lg">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="tile space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      </div>
    </LoadingRegion>
  );
}
