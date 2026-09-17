import { CardGridSkeleton, LoadingRegion, Skeleton } from '@/components/skeleton';

/** The roster gallery: a heading and a grid of avatars at the same density. */
export default function Loading() {
  return (
    <LoadingRegion>
      <Skeleton className="h-6 w-56" />
      <CardGridSkeleton
        count={18}
        className="grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]"
        height="h-28"
      />
    </LoadingRegion>
  );
}
