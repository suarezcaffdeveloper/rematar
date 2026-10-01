import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `RematadorRemateCard`, en versión "cargando". */
export function RematadorRemateCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
      <Skeleton className="mt-4 h-6 w-3/4" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <div className="mt-4 grid grid-cols-4 gap-1">
        <Skeleton className="h-1 rounded-full" />
        <Skeleton className="h-1 rounded-full" />
        <Skeleton className="h-1 rounded-full" />
        <Skeleton className="h-1 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-4 w-5/6" />
      <Skeleton className="mt-4 h-10 w-full rounded-full" />
    </div>
  );
}
