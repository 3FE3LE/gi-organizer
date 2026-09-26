import { LoadingRegion, Skeleton } from '@/components/skeleton';

/**
 * One team board: its header, four member cards — beside their portrait on a
 * phone, in columns wider up — and the synergy strip under them. The rail it
 * used to sit beside is a drawer now, so the page is one column.
 */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-14 w-64 rounded-xl" />
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-edge px-4 py-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="ml-auto h-7 w-32" />
          </div>
          <div className="grid gap-px bg-edge sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 bg-surface px-3 pb-3 pt-9 sm:flex-col sm:pt-4">
                <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
                <div className="w-full space-y-2 sm:flex sm:flex-col sm:items-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-48 rounded-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-edge px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
