import { LoadingRegion, PanelsSkeleton, Skeleton, ToolbarSkeleton } from '@/components/skeleton';

/**
 * Nested under the plan layout, so its heading and tabs are already on screen
 * and switching between the two views never blanks the section header.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <ToolbarSkeleton />
      <Skeleton className="h-7 w-44" />
      <PanelsSkeleton count={4} height="h-28" />
    </LoadingRegion>
  );
}
