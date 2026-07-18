import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `RematadorRemateCard`, en versión "cargando". */
export function RematadorRemateCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
