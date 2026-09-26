import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** The upgrades view's shape: three counts, then a column of step cards. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-8">
        <div className="grid grid-cols-3 gap-2 sm:max-w-lg">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="tile space-y-2 px-3 py-2.5">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="card flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <span className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </span>
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
