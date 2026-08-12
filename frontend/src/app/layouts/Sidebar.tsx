import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bot, Gavel, History, LayoutDashboard, LogOut, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useAuth, useAuthActions } from '../../features/auth/hooks';
import type { UserRole } from '../../features/auth/types';
import { Button } from '../../shared/components/Button';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';

/** Iniciales para el avatar del pie del sidebar -- primera letra del primer y último
 * nombre (`"Ana Rematadora"` -> `"AR"`), o solo la primera si es una única palabra. */
function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export interface SidebarProps {
  role: UserRole | undefined;
  /** Solo controla el drawer de mobile/tablet -- en desktop (`lg:` en adelante) el
   * sidebar siempre está visible, persistente (riel compacto, se expande al hover). */
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
    { label: 'Simuladores', to: '/simuladores', icon: Bot },
    { label: 'Ventas adjudicadas', to: '/ventas-adjudicadas', icon: Package },
    { label: 'Historial', to: '/historial', icon: History },
  ],
  admin: [{ label: 'Panel de administrador', to: '/admin', icon: LayoutDashboard }],
};

/** Label que se recorta a lo ancho del riel colapsado (`compact`) y aparece con un fade
 * al expandirse por hover/foco (`group-hover`/`group-focus-within` sobre el `<aside>`) --
 * el texto queda siempre en el DOM (nunca se remueve condicionalmente), así el nombre
 * accesible del link/botón no cambia según el estado visual. En el drawer mobile
 * (`compact` false) el label es siempre visible, sin ningún fade. */
function CollapsibleLabel({ compact, children }: { compact: boolean; children: string }) {
  return (
    <span
      className={clsx(
        'whitespace-nowrap',
        compact && 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
      )}
    >
      {children}
    </span>
  );
}

function NavItemLink({
  to,
  end,
  icon: Icon,
  label,
  onNavigate,
  compact,
}: {
  to: string;
  end: boolean;
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
  compact: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      <CollapsibleLabel compact={compact}>{label}</CollapsibleLabel>
    </NavLink>
  );
}

function SidebarContent({
  role,
  onNavigate,
  compact = false,
}: {
  role: UserRole | undefined;
  onNavigate: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const items = role ? NAV_ITEMS_BY_ROLE[role] : [];
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Link to="/" onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-3 px-[1.125rem] text-lg font-bold text-brand-700">
        <Gavel aria-hidden="true" className="h-6 w-6 shrink-0" />
        <CollapsibleLabel compact={compact}>RematAR</CollapsibleLabel>
      </Link>
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-2">
        {items.map(({ label, to, icon }) => (
          <NavItemLink key={to} to={to} end={to === '/'} icon={icon} label={label} onNavigate={onNavigate} compact={compact} />
        ))}
      </nav>

      {user && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 px-3 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {getInitials(user.full_name)}
            </span>
            <div
              className={clsx(
                'min-w-0',
                compact && 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
              )}
            >
              <p className="truncate text-sm font-semibold text-slate-900">{user.full_name}</p>
              <p className="truncate text-xs capitalize text-slate-400">{user.role}</p>
            </div>
          </div>
          {compact ? (
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
              <CollapsibleLabel compact>Cerrar sesión</CollapsibleLabel>
            </button>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setIsLogoutConfirmOpen(true)}>
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Cerrar sesión
            </Button>
          )}
        </div>
      )}

      <LogoutConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onCancel={() => setIsLogoutConfirmOpen(false)}
        onConfirm={() => {
          setIsLogoutConfirmOpen(false);
          logout();
        }}
      />
    </div>
  );
}

/**
 * El drawer mobile (`lg:hidden`) se trata como un diálogo modal: `role="dialog"` +
 * `aria-modal`, foco inicial en el primer link, trap de Tab dentro del panel y
 * restauración del foco al botón que lo abrió al cerrarse (`useFocusTrap`, Épica 9,
 * Etapa 7 -- rediseño, accesibilidad final). Sigue siendo un panel ancho (`w-64`) con
 * todos los labels visibles -- no tiene sentido un riel colapsado en mobile, donde no
 * hay hover.
 *
 * El riel persistente de desktop (rediseño "Modo Remate", inspirado en la captura de
 * Stitch) reemplaza el sidebar ancho fijo por uno compacto (`w-16`, solo íconos) que se
 * expande suavemente a `w-64` al pasar el mouse (o al enfocar un ítem con teclado,
 * `focus-within` -- paridad de accesibilidad con el hover) vía `group`/`group-hover` de
 * Tailwind, sin ningún estado de React: el ancho del `<aside>` transiciona con CSS y los
 * labels (que siguen en el DOM siempre, nunca se remueven condicionalmente) aparecen con
 * un fade. Antes este sidebar se ocultaba por completo en "Modo Remate" (`isFocusMode`,
 * ver `AppLayout`); ahora, al ser compacto por default, deja de estorbar y
 * `AppLayout` lo muestra siempre -- la Consola Operativa del rematador ya no necesita
 * ocultarlo, solo sigue ocultando el `Header` (la verdadera "barra superior").
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
      <aside className="group hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-16 lg:flex-col lg:overflow-hidden lg:border-r lg:border-slate-200 lg:bg-white lg:shadow-sm lg:transition-[width] lg:duration-200 lg:ease-out lg:hover:w-64 lg:focus-within:w-64">
        <SidebarContent role={role} onNavigate={() => {}} compact />
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
