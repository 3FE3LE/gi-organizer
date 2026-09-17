import { CardGridSkeleton, LoadingRegion, Skeleton, ToolbarSkeleton } from '@/components/skeleton';

/** The box: header counts, the filter toolbar, then the cards. */
export default function Loading() {
  return (
    <LoadingRegion>
      <Skeleton className="h-6 w-64" />
      <ToolbarSkeleton />
      <CardGridSkeleton count={9} />
    </LoadingRegion>
  );
}
