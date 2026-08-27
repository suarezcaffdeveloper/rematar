import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export interface BreadcrumbItem {
  label: string;
  /** Sin `to`, se renderiza como texto plano -- para el paso actual (no navegable). */
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/** Navegación de "migas de pan" genérica -- no sabe nada de remates ni de ningún otro
 * dominio, solo recibe la lista de pasos ya armada por quien la usa.
 *
 * Una sola línea siempre (nunca envuelve a 2-3 líneas): el `Header` que la contiene
 * tiene altura fija (`h-16`) -- un breadcrumb que envuelve la desborda sin que crezca
 * (el título de la página queda tapado detrás, ver auditoría mobile). El primer paso
 * (la raíz, típicamente corta como "Mis remates") nunca se achica
 * (`shrink-0 whitespace-nowrap`); el resto (incluye pasos intermedios largos y
 * dinámicos -- ej. el título de un remate en `RemateAuditLogPage`, no solo el último
 * paso) se achica y trunca con "…" (`min-w-0 truncate`, con un `max-w` para repartir el
 * espacio si hay más de un paso largo), con el texto completo disponible en `title`. */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Ruta de navegación" className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isRoot = index === 0;
        return (
          <span
            key={`${item.label}-${index}`}
            className={clsx('flex min-w-0 items-center gap-1.5', isRoot ? 'shrink-0' : 'shrink')}
          >
            {index > 0 && (
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                title={isRoot ? undefined : item.label}
                className={clsx(
                  'transition-colors hover:text-brand-600',
                  isRoot ? 'whitespace-nowrap' : 'min-w-0 max-w-[40vw] truncate sm:max-w-[220px]',
                )}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={clsx(
                  'font-medium text-slate-700',
                  isRoot ? 'whitespace-nowrap' : 'min-w-0 max-w-[40vw] truncate sm:max-w-[220px]',
                )}
                aria-current={isLast ? 'page' : undefined}
                title={isRoot ? undefined : item.label}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
