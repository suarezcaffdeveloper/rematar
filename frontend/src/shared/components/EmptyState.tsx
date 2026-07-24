import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Estado vacío genérico -- "no hay nada que mostrar" en cualquier listado futuro, no
 * solo el dashboard de remates. `icon` es opcional y llega ya armado desde quien lo usa
 * (este componente no importa ninguna librería de íconos, ver ADR-027 sobre mantener el
 * árbol de dependencias chico).
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
