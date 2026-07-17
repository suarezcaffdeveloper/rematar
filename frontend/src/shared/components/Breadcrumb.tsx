import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  /** Sin `to`, se renderiza como texto plano -- para el paso actual (no navegable). */
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/** Navegación de "migas de pan" genérica -- no sabe nada de remates ni de ningún otro
 * dominio, solo recibe la lista de pasos ya armada por quien la usa. */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-sm text-slate-500">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 text-slate-300">
                <path
                  d="m7.5 4.5 5.5 5.5-5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {item.to && !isLast ? (
              <Link to={item.to} className="transition-colors hover:text-brand-600">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-slate-700' : undefined} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
