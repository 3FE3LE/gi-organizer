import { LoadingRegion } from '@/components/skeleton';

import { DomainCardsSkeleton, FilterBarSkeleton, TodayCardSkeleton } from './skeletons';

/**
 * Nested under the plan layout, so its heading and tabs are already on screen
 * and switching between the two views never blanks the section header.
 *
 * The shape is the farming view's — the day card, the filters, the domains —
 * since that is where signing in lands; the upgrades tab has its own.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <TodayCardSkeleton />
        <FilterBarSkeleton />
        <DomainCardsSkeleton />
      </div>
    </LoadingRegion>
  );
}
