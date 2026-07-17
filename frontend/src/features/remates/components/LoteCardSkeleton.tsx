import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `LoteCard`, en versión "cargando". */
export function LoteCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:flex-row">
      <Skeleton className="aspect-video w-full shrink-0 rounded-none sm:aspect-square sm:w-40" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
      </div>
    </div>
  );
}
