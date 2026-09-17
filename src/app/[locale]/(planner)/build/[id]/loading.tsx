import { LoadingRegion, PanelsSkeleton, Skeleton } from '@/components/skeleton';

/**
 * The character panel is the tall thing at the top of every tab, so the
 * fallback leads with it rather than with a generic bar.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <Skeleton className="h-44" />
      <Skeleton className="h-9 w-72" />
      <PanelsSkeleton count={2} height="h-40" />
    </LoadingRegion>
  );
}
