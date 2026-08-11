import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `RematadorRemateCard`, en versión "cargando". */
export function RematadorRemateCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
