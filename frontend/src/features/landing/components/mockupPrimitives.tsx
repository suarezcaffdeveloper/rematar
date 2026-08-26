import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/**
 * Piezas chicas repetidas entre las tres escenas rotativas de `RotatingMockup`
 * (empresa/rematador/comprador) -- separadas acá para no repetir las mismas clases de
 * Tailwind tres veces, no porque haya una necesidad de reuso fuera de ese contexto.
 */

/** Placeholder de portada -- mismo degradé de marca que `CoverPlaceholder`
 * (`features/remates/components/CoverPlaceholder.tsx`) recreado acá en vez de
 * importarlo, para que `features/landing` no dependa de otro feature. */
export function CoverBox({ className, icon }: { className?: string; icon: ReactNode }) {
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-100 via-brand-50 to-slate-100',
        className,
      )}
    >
      {icon}
    </div>
  );
}

export function Eyebrow({
  icon: Icon,
  className,
  children,
}: {
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={clsx(
        'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400',
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </p>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-100">
      <p className="truncate text-[10px] font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
