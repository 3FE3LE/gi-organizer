import { CardGridSkeleton, LoadingRegion, PanelsSkeleton } from '@/components/skeleton';

/** Counts first, then whatever the tab below them holds. */
export default function Loading() {
  return (
    <LoadingRegion>
      <CardGridSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" height="h-24" />
      <PanelsSkeleton count={2} height="h-20" />
    </LoadingRegion>
  );
}
