import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `RematadorRemateCard`, en versión "cargando". */
export function RematadorRemateCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-4 p-5">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2.5 h-5 w-3/4" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
