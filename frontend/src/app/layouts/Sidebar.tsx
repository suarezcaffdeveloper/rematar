import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bot, Gavel, History, LayoutDashboard, LogOut, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { useAuth, useAuthActions } from '../../features/auth/hooks';
import type { UserRole } from '../../features/auth/types';
import { Button } from '../../shared/components/Button';
import { UserAvatar } from '../../shared/components/UserAvatar';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';

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

/** Logo oficial (`logo-rematar.png`, 660x245px -- isotipo + wordmark en un solo asset,
 * sin versión recortada aparte). Mismo truco que `CollapsibleLabel`: la imagen nunca se
 * escala de forma distinta a su proporción original (siempre `h-8`, ancho proporcional
 * vía `w-auto`) -- lo que cambia es cuánto de ella queda visible, recortando con
 * `overflow-hidden` sobre un contenedor cuyo ancho transiciona igual que el propio
 * riel (`group-hover`/`group-focus-within`, sin JS). Anchos calculados a mano sobre el
 * asset real: a `h-8` (32px) la imagen completa mide ~86px de ancho; el isotipo (sin el
 * texto "RematAR") termina alrededor del píxel 226 del original y el texto arranca en el
 * 240 -- 30px de contenedor revela hasta el ~230 (con margen a cada lado) sin cortar el
 * isotipo ni asomar el texto. Si se reemplaza el asset por otro con proporciones
 * distintas, estos dos anchos hay que recalcularlos. */
function SidebarLogo({ compact }: { compact: boolean }) {
  return (
    <span
      className={clsx(
        'block h-8 shrink-0 overflow-hidden',
        compact
          ? 'w-[30px] transition-[width] duration-200 ease-out group-hover:w-[86px] group-focus-within:w-[86px]'
          : 'w-[86px]',
      )}
    >
      <img src={logoRematar} alt="RematAR" className="h-8 w-auto max-w-none" />
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
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
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
      <Link to="/" onClick={onNavigate} className="flex h-16 shrink-0 items-center px-3">
        <SidebarLogo compact={compact} />
      </Link>
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-2">
        {items.map(({ label, to, icon }) => (
          <NavItemLink key={to} to={to} end={to === '/'} icon={icon} label={label} onNavigate={onNavigate} compact={compact} />
        ))}
      </nav>

      {user && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-line px-3 py-4">
          <Link
            to="/perfil"
            onClick={onNavigate}
            aria-label="Ver mi perfil"
            className="flex items-center gap-3 rounded-xl p-1 -m-1 transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <UserAvatar avatarUrl={user.avatar_url} fullName={user.full_name} size="sm" />
            <div
              className={clsx(
                'min-w-0',
                compact && 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
              )}
            >
              <p className="truncate text-sm font-semibold text-ink">{user.full_name}</p>
              <p className="truncate text-xs capitalize text-ink-faint">{user.role}</p>
            </div>
          </Link>
          {compact ? (
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-all duration-200 hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
      <aside className="group hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-16 lg:flex-col lg:overflow-hidden lg:border-r lg:border-line lg:bg-white lg:shadow-sm lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out lg:hover:w-64 lg:hover:shadow-lg lg:focus-within:w-64 lg:focus-within:shadow-lg">
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
            className="relative flex h-full w-64 flex-col border-r border-line bg-white shadow-xl"
          >
            <SidebarContent role={role} onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
