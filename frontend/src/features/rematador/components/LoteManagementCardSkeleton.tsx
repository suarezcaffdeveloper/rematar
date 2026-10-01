import { Skeleton } from '../../../shared/components/Skeleton';

/** Misma forma que `LoteCatalogCard`, en versión "cargando". */
export function LoteManagementCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      <Skeleton className="mt-3.5 h-6 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-3 h-7 w-2/3" />
      <Skeleton className="mt-4 h-10 w-full rounded-full" />
    </div>
  );
}
