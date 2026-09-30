import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** The tab's shape: the domains, then who needs them. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        <Skeleton className="h-80 rounded-[var(--radius-card)]" />
      </div>
    </LoadingRegion>
  );
}
