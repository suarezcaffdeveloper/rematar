import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AuthRubro } from './authRubros';

const ROW_H = 52;
const ACTIVE_H = 96;
/** Filas visibles antes y después de la activa. */
const ABOVE = 1;
const BELOW = 3;
const HEIGHT = ABOVE * ROW_H + ACTIVE_H + BELOW * ROW_H;
const BELOW_OPACITY = [0.55, 0.32, 0.16];

/** Posición de cada rubro respecto del activo: 0 = el activo, -1 = el anterior, 1.. = los siguientes. */
function slotOf(i: number, active: number, total: number): number {
  const d = (((i - active) % total) + total) % total;
  return d <= total - 1 - ABOVE ? d : d - total;
}

function yOf(slot: number): number {
  if (slot < 0) return (slot + ABOVE) * ROW_H;
  if (slot === 0) return ABOVE * ROW_H;
  if (slot > BELOW) return HEIGHT;
  return ABOVE * ROW_H + ACTIVE_H + (slot - 1) * ROW_H;
}

function opacityOf(slot: number): number {
  if (slot === 0) return 1;
  if (slot === -1) return 0.3;
  if (slot >= 1 && slot <= BELOW) return BELOW_OPACITY[slot - 1];
  return 0;
}

export interface CategoryCarouselProps {
  items: AuthRubro[];
  index: number;
  onSelect: (index: number) => void;
  /** Duración de la barra de progreso de la fila activa (el tiempo que rota sola). */
  durationMs: number;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
}

/**
 * Carrusel de rubros en forma de "rueda": el rubro de la foto de fondo ocupa siempre la misma
 * posición (destacado, con su nombre completo y una barra de progreso) y los demás giran
 * alrededor -- así el nombre nunca queda fuera de vista, sin importar cuántas categorías haya.
 * Muestra una fila anterior y tres siguientes; el resto espera fuera de cuadro. Al pasar el
 * mouse, la rotación automática se frena; un clic elige ese rubro.
 */
export function CategoryCarousel({
  items,
  index,
  onSelect,
  durationMs,
  paused,
  onPausedChange,
}: CategoryCarouselProps) {
  const total = items.length;

  return (
    <div
      role="group"
      aria-label="Rubros"
      className="relative max-w-md overflow-hidden [mask-image:linear-gradient(to_bottom,black_0,black_80%,transparent)]"
      style={{ height: HEIGHT }}
      onMouseEnter={() => onPausedChange(true)}
      onMouseLeave={() => onPausedChange(false)}
    >
      <ul className="relative h-full">
        {items.map((item, i) => (
          <CarouselRow
            key={item.category}
            item={item}
            slot={slotOf(i, index, total)}
            index={index}
            durationMs={durationMs}
            paused={paused}
            onSelect={() => onSelect(i)}
          />
        ))}
      </ul>
    </div>
  );
}

interface CarouselRowProps {
  item: AuthRubro;
  slot: number;
  index: number;
  durationMs: number;
  paused: boolean;
  onSelect: () => void;
}

function CarouselRow({ item, slot, index, durationMs, paused, onSelect }: CarouselRowProps) {
  const reduceMotion = useReducedMotion();
  const isActive = slot === 0;
  const isVisible = slot >= -ABOVE && slot <= BELOW;

  // Al dar la vuelta (sale por arriba y reaparece abajo) salta de lugar sin recorrer el cuadro.
  const previousSlot = useRef(slot);
  const wrapped = previousSlot.current < 0 && slot > 0;
  useEffect(() => {
    previousSlot.current = slot;
  }, [slot]);

  const transition = reduceMotion
    ? { duration: 0 }
    : wrapped
      ? { y: { duration: 0 }, opacity: { duration: 0.25 } }
      : { type: 'spring' as const, stiffness: 170, damping: 26 };

  return (
    <motion.li
      initial={false}
      animate={{ y: yOf(slot), opacity: opacityOf(slot) }}
      transition={transition}
      className="absolute inset-x-0 top-0"
      style={{
        height: isActive ? ACTIVE_H : ROW_H,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      aria-hidden={!isVisible}
    >
      <button
        type="button"
        onClick={onSelect}
        tabIndex={isVisible ? 0 : -1}
        aria-current={isActive ? 'true' : undefined}
        className="group block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="flex items-center gap-4" style={{ height: ROW_H }}>
          <span
            className={`h-px shrink-0 transition-all duration-500 ${
              isActive ? 'w-10 bg-white' : 'w-4 bg-white/40 group-hover:w-6 group-hover:bg-white/70'
            }`}
          />
          <span className="text-2xl font-semibold tracking-tight text-white">{item.label}</span>
        </span>
        {isActive && (
          // Aparece con un pequeño retraso: la fila todavía se está acomodando en su lugar y
          // el texto no debe pisar a la de abajo mientras tanto.
          <motion.span
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.35 }}
            className="-mt-1.5 block pl-14"
          >
            <span className="block text-[13px] text-white/60">{item.fullLabel}</span>
            <span className="relative mt-3 block h-px w-48 overflow-hidden bg-white/20">
              <span
                key={index}
                className={`absolute inset-0 origin-left bg-white ${paused ? '' : 'animate-stage-progress'}`}
                style={{ ['--stage-duration' as string]: `${durationMs}ms` }}
              />
            </span>
          </motion.span>
        )}
      </button>
    </motion.li>
  );
}
