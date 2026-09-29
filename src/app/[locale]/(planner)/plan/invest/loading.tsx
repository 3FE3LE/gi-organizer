import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** The tab's shape: the strategy strip, then a list of steps. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-80 rounded-[var(--radius-card)]" />
      </div>
    </LoadingRegion>
  );
}
