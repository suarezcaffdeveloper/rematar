import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * Primitivos de tabla (Épica 9, Etapa 1 -- rediseño, no existían antes). El resto de la
 * app usa listas de "row-cards" para datos densos (auditoría, historial, lotes) por una
 * decisión de producto ya documentada ("evitar tablas excesivamente cargadas") -- estos
 * componentes quedan disponibles para pantallas futuras que sí se beneficien de
 * densidad tabular real, sin forzar una migración de lo que ya funciona bien como cards.
 *
 * Wrappers finos sobre los elementos nativos de `<table>` (no un componente
 * "data-driven" con `columns`/`rows`) -- máxima flexibilidad de composición, mismo
 * criterio que el resto del sistema de diseño.
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={clsx('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={clsx(
        'border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={clsx('divide-y divide-slate-100', className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx('transition-colors hover:bg-slate-50', className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={clsx('px-4 py-3 font-medium', className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx('px-4 py-3 text-slate-700', className)} {...props} />;
}
