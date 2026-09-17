import { LoadingRegion, Skeleton } from '@/components/skeleton';

/** The rail and the board, in the two-column shape the page settles into. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    </LoadingRegion>
  );
}
