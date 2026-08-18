import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `LoteManagementCard`, en versión "cargando". */
export function LoteManagementCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <Skeleton className="h-20 w-6" />
      <Skeleton className="h-20 w-28 shrink-0 rounded-xl" />
      <div className="flex-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}
