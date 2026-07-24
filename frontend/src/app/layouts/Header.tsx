import { LogOut, Menu } from 'lucide-react';
import { useAuth, useAuthActions } from '../../features/auth/hooks';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { Breadcrumb } from '../../shared/components/Breadcrumb';
import { Button } from '../../shared/components/Button';
import { useBreadcrumbStore } from './breadcrumbStore';

export interface HeaderProps {
  onOpenSidebar: () => void;
}

/**
 * Header delgado (Épica 9, Etapa 2 -- rediseño): reemplaza el único header que existía
 * antes (logo + link admin + nombre/rol + logout, `AppLayout.tsx` previo a esta etapa).
 * El logo pasó al `Sidebar`; el link a `/admin` que vivía acá (Épica 8.0) ahora es un
 * ítem más de esa navegación por rol. Lo único que este header dibuja es lo que cambia
 * pantalla a pantalla (el breadcrumb, vía `useBreadcrumbStore`) más las acciones de
 * usuario que tienen que estar siempre visibles.
 */
export function Header({ onOpenSidebar }: HeaderProps) {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const items = useBreadcrumbStore((state) => state.items);

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Abrir menú de navegación"
        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">{items.length > 0 && <Breadcrumb items={items} />}</div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell />
        {user && (
          <span className="hidden text-sm text-slate-600 sm:inline">
            {user.full_name} · <span className="text-slate-400">{user.role}</span>
          </span>
        )}
        <Button variant="secondary" onClick={logout}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </div>
    </header>
  );
}
