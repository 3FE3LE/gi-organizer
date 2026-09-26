import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * The import tab's own shape — two sections of a heading, a line of
 * explanation and a row of controls — rather than the inventory's stat tiles
 * it inherited from the tab beside it.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-8">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-md" />
            <div className="flex gap-3">
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
