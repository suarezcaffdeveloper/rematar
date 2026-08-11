import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `RemateCard`, en versión "cargando" -- se muestra en una grilla
 * mientras `useRemates` todavía no resolvió la primera carga. */
export function RemateCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-4 p-5">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2.5 h-5 w-3/4" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    </div>
  );
}
