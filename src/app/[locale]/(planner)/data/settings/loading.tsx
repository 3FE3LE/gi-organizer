import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** A heading, a line of explanation and the strip of servers. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full max-w-md" />
        <Skeleton className="h-8 w-72 rounded-lg" />
      </div>
    </LoadingRegion>
  );
}
