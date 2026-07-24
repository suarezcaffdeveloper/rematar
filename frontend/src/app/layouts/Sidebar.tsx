import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Gavel, History, LayoutDashboard, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import type { UserRole } from '../../features/auth/types';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';

export interface SidebarProps {
  role: UserRole | undefined;
  /** Solo controla el drawer de mobile/tablet -- en desktop (`lg:` en adelante) el
   * sidebar siempre está visible, persistente. */
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Navegación por rol (Épica 9, Etapa 2 -- rediseño). `comprador`/`rematador` tienen su
 * dashboard real en `/` (`HomePage` ya rutea por rol, sin cambios); `admin` no tiene
 * dashboard propio, así que su único ítem apunta directo a `/admin` -- reemplaza el
 * link condicional que antes vivía suelto en el header (Épica 8.0).
 */
const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  comprador: [
    { label: 'Remates', to: '/', icon: Gavel },
    { label: 'Mis compras', to: '/mis-compras', icon: ShoppingBag },
  ],
  rematador: [
    { label: 'Mis remates', to: '/', icon: Gavel },
    { label: 'Ventas adjudicadas', to: '/ventas-adjudicadas', icon: Package },
    { label: 'Historial', to: '/historial', icon: History },
  ],
  admin: [{ label: 'Panel de administrador', to: '/admin', icon: LayoutDashboard }],
};

function SidebarContent({ role, onNavigate }: { role: UserRole | undefined; onNavigate: () => void }) {
  const items = role ? NAV_ITEMS_BY_ROLE[role] : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link to="/" onClick={onNavigate} className="text-lg font-bold text-brand-700">
          RematAR
        </Link>
      </div>
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-2">
        {items.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * El drawer mobile (`lg:hidden`) se trata como un diálogo modal: `role="dialog"` +
 * `aria-modal`, foco inicial en el primer link, trap de Tab dentro del panel y
 * restauración del foco al botón que lo abrió al cerrarse (`useFocusTrap`, Épica 9,
 * Etapa 7 -- rediseño, accesibilidad final). El sidebar persistente de desktop no lo
 * necesita: nunca se superpone al resto del contenido.
 */
export function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(drawerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        <SidebarContent role={role} onNavigate={() => {}} />
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="relative flex h-full w-64 flex-col border-r border-slate-200 bg-white shadow-xl"
          >
            <SidebarContent role={role} onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
