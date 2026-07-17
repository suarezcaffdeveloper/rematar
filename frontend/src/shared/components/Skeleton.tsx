import clsx from 'clsx';

/**
 * Bloque de carga genérico ("shimmer") — la unidad básica con la que se arma
 * cualquier esqueleto de carga (`RemateCardSkeleton`, y los que sigan en features
 * futuros). No sabe nada de ningún dominio, solo dibuja un rectángulo animado.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('animate-pulse rounded-md bg-slate-200', className)} />;
}
