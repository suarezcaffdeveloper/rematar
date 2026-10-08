import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { LogIn, LogOut, type LucideIcon } from 'lucide-react';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { useAuth, useAuthActions } from '../../features/auth/hooks';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { UserAvatar } from '../../shared/components/UserAvatar';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';
import { NAV_ITEMS_BY_ROLE, PUBLIC_NAV_ITEMS } from './navItems';

const PILL_COLLAPSED_WIDTH = 470;
const PILL_EXPANDED_WIDTH = 1040;
const BAR_MAX_WIDTH = 1760;
const PILL_VIEWPORT_MARGIN = 24;

/** Borde lateral de la barra a pantalla completa: el mismo `px` que usa el contenedor de
 * la home (`px-3 sm:px-6 lg:px-10`), para que el logo y las acciones queden alineados con
 * el cuerpo de la página. */
function sidePadding(viewportWidth: number): number {
  if (viewportWidth >= 1024) return 40;
  if (viewportWidth >= 640) return 24;
  return 12;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Nav superior del inicio del comprador -- reemplaza a `Sidebar` + `Header` mientras la
 * página lo pide (`useTopNavLayout`, ver `AppLayout`). Dos estados con una transición
 * continua entre ellos:
 *
 * - Arriba de todo (scroll ~0): barra a todo el ancho con el logo completo y las opciones
 *   con su texto.
 * - Al scrollear: la barra "se cierra" y se convierte en una píldora flotante centrada,
 *   con sombra. El logo queda solo con el isotipo y solo la opción activa muestra su
 *   texto. Con el mouse encima (o el foco del teclado adentro, o el panel de
 *   notificaciones abierto) la píldora se vuelve a abrir.
 *
 * Es `sticky` dentro del flujo (ocupa los 64px de la barra), así que el cuerpo de la
 * página no necesita ningún padding extra. Con `staticBar` (Sala en vivo) es en cambio una
 * barra completa que se queda al principio de la página: no sigue el scroll ni se achica,
 * porque mientras dura el remate no se navega -- para salir se vuelve hacia arriba. El cambio de estado tiene histéresis (entra
 * pasando los 56px, vuelve recién por debajo de los 12px) para que no parpadee cerca del
 * umbral. Las opciones salen de `navItems.ts` (mismas que el `Sidebar`, por rol); un
 * visitante anónimo ve "Iniciar sesión" en lugar de campana, perfil y salir.
 */
export function BuyerTopNav({ staticBar = false }: { staticBar?: boolean }) {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const viewportWidth = useViewportWidth();
  const wide = viewportWidth >= 640;
  const { scrollY } = useScroll();

  const [scrolledState, setScrolled] = useState(false);
  // Con `staticBar` la barra nunca pasa a píldora: se queda completa, donde está.
  const scrolled = !staticBar && scrolledState;
  const [engaged, setEngaged] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled((prev) => (prev ? y > 12 : y > 56));
  });

  const items = user ? NAV_ITEMS_BY_ROLE[user.role] : PUBLIC_NAV_ITEMS;
  const expanded = !scrolled || engaged || bellOpen;
  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 240, damping: 30 };
  const pad = sidePadding(viewportWidth);
  const pillWidth = Math.min(
    expanded ? PILL_EXPANDED_WIDTH : PILL_COLLAPSED_WIDTH,
    viewportWidth - PILL_VIEWPORT_MARGIN,
  );

  return (
    <header className={`pointer-events-none top-0 z-40 h-16 ${staticBar ? 'relative' : 'sticky'}`}>
      {/* Fondo de la barra a todo el ancho: se desvanece cuando pasa a píldora. */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 border-b border-line bg-white/90 backdrop-blur"
        initial={false}
        animate={{ opacity: scrolled ? 0 : 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
      />

      <motion.nav
        aria-label="Navegación principal"
        className={`pointer-events-auto relative mx-auto grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border ${
          scrolled ? 'backdrop-blur-md' : ''
        }`}
        initial={false}
        animate={{
          maxWidth: scrolled ? pillWidth : BAR_MAX_WIDTH,
          height: scrolled ? 54 : 64,
          marginTop: scrolled ? 5 : 0,
          paddingLeft: scrolled ? 14 : pad,
          paddingRight: scrolled ? 10 : pad,
          borderRadius: scrolled ? 999 : 0,
          backgroundColor: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0)',
          borderColor: scrolled ? 'rgba(231,231,234,1)' : 'rgba(231,231,234,0)',
          boxShadow: scrolled
            ? '0 14px 34px -12px rgba(16,17,20,0.28), 0 2px 6px rgba(16,17,20,0.06)'
            : '0 0 0 0 rgba(16,17,20,0)',
        }}
        transition={spring}
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => setEngaged(false)}
        onFocus={() => setEngaged(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
        }}
      >
        <Link
          to={user ? '/' : '/remates'}
          aria-label="RematAR, ir al inicio"
          className="flex h-10 items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {/* Mismo recorte que `SidebarLogo`: poco más de 30px revela solo el isotipo,
           * 152px el logo completo (asset de 746x160, renderizado a h-8). */}
          <motion.span
            className="block h-8 shrink-0 overflow-hidden"
            initial={false}
            animate={{ width: expanded && wide ? 152 : 30 }}
            transition={spring}
          >
            <img src={logoRematar} alt="" className="h-8 w-auto max-w-none" />
          </motion.span>
        </Link>

        <ul className="flex items-center justify-self-center gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavOption
                to={item.to}
                end={item.to === '/'}
                label={item.label}
                icon={item.icon}
                expanded={expanded}
                wide={wide}
                spring={spring}
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 justify-self-end">
          {user ? (
            <>
              <NotificationBell variant="pill" onOpenChange={setBellOpen} />
              <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />
              <Link
                to="/perfil"
                aria-label="Ver mi perfil"
                className="flex h-10 items-center rounded-full p-0.5 transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <UserAvatar avatarUrl={user.avatar_url} fullName={user.full_name} size="sm" />
                <motion.span
                  className="hidden overflow-hidden whitespace-nowrap text-left lg:block"
                  initial={false}
                  animate={{
                    width: expanded ? 'auto' : 0,
                    opacity: expanded ? 1 : 0,
                    marginLeft: expanded ? 10 : 0,
                    marginRight: expanded ? 8 : 0,
                  }}
                  transition={spring}
                >
                  <span className="block max-w-40 truncate text-sm font-semibold leading-tight text-ink">
                    {user.full_name}
                  </span>
                  <span className="block text-xs capitalize leading-tight text-ink-faint">{user.role}</span>
                </motion.span>
              </Link>
              <ActionButton
                label="Cerrar sesión"
                visibleLabel="Salir"
                icon={LogOut}
                showLabel={wide && expanded}
                spring={spring}
                onClick={() => setIsLogoutConfirmOpen(true)}
              />
            </>
          ) : (
            <ActionButton
              label="Iniciar sesión"
              icon={LogIn}
              showLabel={wide}
              spring={spring}
              onClick={() => navigate('/login')}
              emphasized
            />
          )}
        </div>
      </motion.nav>

      <LogoutConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onCancel={() => setIsLogoutConfirmOpen(false)}
        onConfirm={() => {
          setIsLogoutConfirmOpen(false);
          // Mismo cierre de sesión explícito que en `Sidebar`: siempre termina en /login.
          // Primero se navega: `logout()` deja sin sesión a quien está en "/" y `RequireAuth` lo mandaría a la landing.
          navigate('/login');
          logout();
        }}
      />
    </header>
  );
}

function NavOption({
  to,
  end,
  label,
  icon: Icon,
  expanded,
  wide,
  spring,
}: {
  to: string;
  end: boolean;
  label: string;
  icon: LucideIcon;
  expanded: boolean;
  wide: boolean;
  spring: object;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `relative flex h-10 min-w-10 items-center justify-center rounded-full px-[11px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isActive ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
        }`
      }
    >
      {({ isActive }) => {
        const showLabel = wide && (expanded || isActive);
        return (
          <>
            {isActive && (
              // El indicador se desliza entre opciones (layoutId compartido) en vez de
              // aparecer y desaparecer en cada link.
              <motion.span
                layoutId="buyer-nav-indicator"
                className="absolute inset-0 rounded-full bg-brand-50"
                transition={spring}
              />
            )}
            <Icon aria-hidden="true" className="relative h-[18px] w-[18px] shrink-0" />
            <motion.span
              aria-hidden="true"
              className="relative overflow-hidden whitespace-nowrap"
              initial={false}
              animate={{ width: showLabel ? 'auto' : 0, opacity: showLabel ? 1 : 0, marginLeft: showLabel ? 8 : 0 }}
              transition={spring}
            >
              {label}
            </motion.span>
          </>
        );
      }}
    </NavLink>
  );
}

function ActionButton({
  label,
  visibleLabel,
  icon: Icon,
  showLabel,
  spring,
  onClick,
  emphasized = false,
}: {
  label: string;
  visibleLabel?: string;
  icon: LucideIcon;
  showLabel: boolean;
  spring: object;
  onClick: () => void;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 min-w-10 items-center justify-center rounded-full px-[11px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        emphasized ? 'bg-brand-600 text-white hover:bg-brand-700' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
      }`}
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
      <motion.span
        aria-hidden="true"
        className="overflow-hidden whitespace-nowrap"
        initial={false}
        animate={{ width: showLabel ? 'auto' : 0, opacity: showLabel ? 1 : 0, marginLeft: showLabel ? 8 : 0 }}
        transition={spring}
      >
        {visibleLabel ?? label}
      </motion.span>
    </button>
  );
}
