import { LoadingRegion, PanelsSkeleton, Skeleton } from '@/components/skeleton';

/**
 * The fallback for any route that does not state a closer one.
 *
 * It sits inside the chrome — header, nav, footer stay on screen and stay
 * clickable — so a slow query costs the content area and nothing else.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <Skeleton className="h-6 w-48" />
      <PanelsSkeleton />
    </LoadingRegion>
  );
}
