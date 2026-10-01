import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { Bell, Gavel, KeyRound, LogOut, ShoppingBag, type LucideIcon } from 'lucide-react';
import logoRematar from '../../../assets/brand/logo-rematar.png';

interface NavOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Mismas opciones que el `Sidebar` real del comprador (`NAV_ITEMS_BY_ROLE.comprador`);
// "Ingresar a remate privado" se acorta a "Remate privado" para que entre en la barra.
const OPTIONS: NavOption[] = [
  { id: 'remates', label: 'Remates', icon: Gavel },
  { id: 'privado', label: 'Remate privado', icon: KeyRound },
  { id: 'compras', label: 'Mis compras', icon: ShoppingBag },
];

const MOCK_NOTIFICATIONS = [
  { id: 1, title: 'Te superaron en el lote 12', detail: 'Gran remate de hacienda Angus y Hereford', time: 'hace 2 min' },
  { id: 2, title: 'Arranca en 30 minutos', detail: 'Flota corporativa: utilitarios y pick-ups', time: 'hace 28 min' },
  { id: 3, title: 'Ganaste el lote 4', detail: 'Coordiná el pago en Mis compras', time: 'ayer' },
];

const PILL_COLLAPSED_WIDTH = 470;
const PILL_EXPANDED_WIDTH = 880;
const BAR_MAX_WIDTH = 1760;

/** Ancho del borde lateral de la barra a pantalla completa: el mismo `px` que usa el
 * contenedor de la página (`px-3 sm:px-6 lg:px-10`), para que el logo y las acciones
 * queden alineados con el cuerpo. */
function sidePadding(viewportWidth: number): number {
  if (viewportWidth >= 1024) return 40;
  if (viewportWidth >= 640) return 24;
  return 12;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Nav del comprador para el inicio. Dos estados con una transición continua entre ellos:
 *
 * - Arriba de todo (scroll ~0): barra a todo el ancho, fija, con el logo completo y todas
 *   las opciones con su texto.
 * - Al scrollear: la barra "se cierra" y se convierte en una píldora flotante centrada,
 *   con sombra. El logo queda solo con el isotipo y solo la opción activa muestra su
 *   texto. Al pasar el mouse (o enfocar con teclado) la píldora se vuelve a abrir.
 *
 * `activeId` elige qué opción arranca marcada (la vista previa de "Mis compras" usa
 * `compras`).
 *
 * Es `sticky` dentro del flujo (ocupa los 64px de la barra), así que no hace falta tocar
 * el padding del cuerpo de la página. El cambio de estado tiene histéresis (entra pasando
 * los 56px, vuelve recién por debajo de 12px) para que no parpadee cerca del umbral.
 */
export function PreviewBuyerNav({
  activeId = 'remates',
  forceCompact = false,
  staticBar = false,
}: {
  activeId?: 'remates' | 'privado' | 'compras';
  /** Siempre en píldora, sin esperar al scroll -- para pantallas que caben en una sola
   * vista (la Sala en vivo) y no scrollean nunca. */
  forceCompact?: boolean;
  /** Barra completa que se queda donde está, al principio de la página: no sigue el scroll
   * ni se achica a píldora. Para pantallas de trabajo como la Sala en vivo, donde no se
   * navega mientras dura el remate -- para salir se vuelve hacia arriba. */
  staticBar?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const viewportWidth = useViewportWidth();
  const wide = viewportWidth >= 640;
  const { scrollY } = useScroll();

  const [scrolledState, setScrolled] = useState(false);
  const scrolled = !staticBar && (forceCompact || scrolledState);
  const [engaged, setEngaged] = useState(false);
  const [current, setCurrent] = useState<string>(activeId);
  const [bellOpen, setBellOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [ring, setRing] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled((prev) => (prev ? y > 12 : y > 56));
  });

  // La campanita recibe una notificación a los pocos segundos: se sacude una vez.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setUnread(3);
      setRing(true);
    }, 1800);
    return () => window.clearTimeout(t);
  }, []);

  const expanded = !scrolled || engaged || bellOpen;
  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 240, damping: 30 };
  const pad = sidePadding(viewportWidth);

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
          maxWidth: scrolled ? (expanded ? PILL_EXPANDED_WIDTH : PILL_COLLAPSED_WIDTH) : BAR_MAX_WIDTH,
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
        <a href="#" onClick={(e) => e.preventDefault()} aria-label="RematAR, ir al inicio" className="flex h-10 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          {/* Mismo recorte que `SidebarLogo`: 33px revela solo el isotipo, 152px el logo
           * completo (asset de 746x160, renderizado a h-8). */}
          <motion.span
            className="block h-8 shrink-0 overflow-hidden"
            initial={false}
            animate={{ width: expanded && wide ? 152 : 30 }}
            transition={spring}
          >
            <img src={logoRematar} alt="" className="h-8 w-auto max-w-none" />
          </motion.span>
        </a>

        <ul className="flex items-center justify-self-center gap-1">
          {OPTIONS.map((option) => {
            const active = option.id === current;
            return (
              <li key={option.id}>
                <NavButton
                  label={option.label}
                  icon={option.icon}
                  active={active}
                  showLabel={wide && (expanded || active)}
                  spring={spring}
                  onClick={() => setCurrent(option.id)}
                />
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1 justify-self-end">
          <div className="relative">
            <BellButton
              open={bellOpen}
              unread={unread}
              ring={ring && !reduceMotion}
              onToggle={() => {
                setBellOpen((o) => !o);
                setUnread(0);
                setRing(false);
              }}
            />
            <NotificationsPopover open={bellOpen} onClose={() => setBellOpen(false)} />
          </div>

          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />

          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            aria-label="Ver mi perfil"
            className="flex h-10 items-center rounded-full p-1 pr-1 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              MR
            </span>
            <motion.span
              className="hidden overflow-hidden whitespace-nowrap text-left lg:block"
              initial={false}
              animate={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0, marginLeft: expanded ? 10 : 0, marginRight: expanded ? 8 : 0 }}
              transition={spring}
            >
              <span className="block text-sm font-semibold leading-tight">Martina Ríos</span>
              <span className="block text-xs leading-tight text-ink-faint">Comprador</span>
            </motion.span>
          </a>

          <NavButton
            label="Cerrar sesión"
            visibleLabel="Salir"
            icon={LogOut}
            active={false}
            showLabel={wide && expanded}
            spring={spring}
            onClick={() => {}}
          />
        </div>
      </motion.nav>
    </header>
  );
}

function NavButton({
  label,
  visibleLabel,
  icon: Icon,
  active,
  showLabel,
  spring,
  onClick,
}: {
  label: string;
  visibleLabel?: string;
  icon: LucideIcon;
  active: boolean;
  showLabel: boolean;
  spring: object;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex h-10 min-w-10 items-center justify-center rounded-full px-[11px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {active && (
        // El indicador se desliza entre opciones (layoutId compartido) en vez de aparecer
        // y desaparecer en cada botón.
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
        {visibleLabel ?? label}
      </motion.span>
    </button>
  );
}

function BellButton({
  open,
  unread,
  ring,
  onToggle,
}: {
  open: boolean;
  unread: number;
  ring: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
      aria-expanded={open}
      aria-haspopup="true"
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <motion.span
        className="origin-top"
        animate={ring ? { rotate: [0, -16, 14, -10, 6, 0] } : { rotate: 0 }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
      >
        <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
      </motion.span>
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {unread}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function NotificationsPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="region"
          aria-label="Notificaciones"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{ transformOrigin: 'top right' }}
          className="absolute right-0 top-full z-50 mt-3 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-white p-2 shadow-xl"
        >
          <p className="px-3 pb-1 pt-2 text-sm font-semibold">Notificaciones</p>
          <ul>
            {MOCK_NOTIFICATIONS.map((n) => (
              <li key={n.id} className="rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-subtle">
                <p className="text-sm font-medium leading-snug">{n.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{n.detail}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{n.time}</p>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
