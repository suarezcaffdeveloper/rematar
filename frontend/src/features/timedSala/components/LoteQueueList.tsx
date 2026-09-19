import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../shared/lib/format';
import { BoxIcon } from '../../remates/components/icons';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import type { Lote } from '../../remates/types';

export interface LoteQueueListProps {
  /** Ya filtrados (búsqueda, incluida categoría) por `TimedSalaPage`. */
  lotes: Lote[];
  selectedLoteId: string;
  onSelect: (loteId: string) => void;
  leadingAmounts: Record<string, string | null>;
  currency: string;
}

/** Aproximación visual del tiempo restante -- "45m", "2h", "3d". Mismo criterio que
 * `LoteCountdown` (fuente de verdad es el backend), pero acá solo hace falta una
 * referencia rápida para escanear la card, no el tictac exacto (no se recalcula solo,
 * cambia cuando el lote cambia). */
function formatTimeRemainingCompact(lote: Lote): string | null {
  if (lote.status !== 'open') return null;
  if (lote.timer_ends_at === null && lote.timer_paused_remaining_seconds === null) return null;

  const remainingSeconds =
    lote.timer_paused_remaining_seconds !== null
      ? lote.timer_paused_remaining_seconds
      : Math.max(0, Math.round((new Date(lote.timer_ends_at!).getTime() - Date.now()) / 1000));

  if (remainingSeconds >= 86400) return `${Math.floor(remainingSeconds / 86400)}d`;
  if (remainingSeconds >= 3600) return `${Math.floor(remainingSeconds / 3600)}h`;
  return `${Math.floor(remainingSeconds / 60)}m`;
}

interface PriceInfo {
  label: string;
  value: string;
  tone: string;
}

/** Fila de precio al pie de la card -- solo dato real: un lote `open` sin ofertas
 * todavía muestra la base como apertura (no inventa un "puja líder"), uno `pending`
 * muestra la base con la que abrirá, uno `closed_sold` el precio final, y uno
 * `closed_unsold` avisa que no tuvo ofertas. Apenas entra la primera oferta, el label
 * pasa de "Base apertura" a "Precio actual" (pedido explícito) -- deja de ser el precio
 * de arranque, es el precio que hay que superar ahora. */
function buildPriceInfo(lote: Lote, leadingAmount: string | null, currency: string): PriceInfo {
  if (lote.status === 'open') {
    if (leadingAmount !== null) {
      return { label: 'Precio actual:', value: formatCurrency(leadingAmount, currency), tone: 'text-success-600' };
    }
    return { label: 'Base apertura:', value: formatCurrency(lote.base_price, currency), tone: 'text-ink' };
  }
  if (lote.status === 'pending') {
    return { label: 'Base apertura:', value: formatCurrency(lote.base_price, currency), tone: 'text-ink' };
  }
  if (lote.status === 'closed_sold') {
    return {
      label: 'Vendido:',
      value: formatCurrency(lote.final_price ?? lote.base_price, currency),
      tone: 'text-success-600',
    };
  }
  return { label: 'Cierre:', value: 'Sin ofertas', tone: 'text-ink-faint' };
}

// Separación entre cards -- mismo ritmo que el `gap-2.5` que tenía la versión anterior.
const GAP = 10;
// Alto de card por default, antes de medir la card real (ver `useLayoutEffect` más
// abajo) -- solo para que el contenedor no arranque en 0px en el primer render.
const DEFAULT_CARD_H = 104;
const SPIN_TRANSITION = 'transform 0.52s cubic-bezier(0.4,0,0.2,1), opacity 0.52s ease';

/** Offset circular más corto de `i` respecto de `active`, en un anillo de `total`
 * elementos -- mismo helper que usa el carrusel de la landing (`ScreenshotsSection`,
 * "Así se ve por dentro"), tomado como referencia explícita para este giro: acá negativo
 * es "hacia arriba" (anterior) y positivo "hacia abajo" (siguiente), en vez de
 * izquierda/derecha. */
function circularOffset(i: number, active: number, total: number): number {
  const raw = (((i - active) % total) + total) % total;
  return raw > total / 2 ? raw - total : raw;
}

/**
 * Selector de "qué lote está fijo" en `TimedSalaPage`, a la izquierda -- carrusel
 * vertical (pedido explícito, "mismo movimiento que el carrusel de la landing pero
 * vertical"): tres cards a la vista (anterior/activa/siguiente), cada una con su info
 * real (portada, estado, base/incremento y precio líder o de apertura) -- la activa se
 * destaca con un borde/resplandor de marca, las de al lado quedan un poco más apagadas
 * pero perfectamente legibles (no recortadas ni borrosas).
 *
 * Misma técnica que `ScreenshotsSection` (pedido explícito, tomada como referencia):
 * CADA lote del listado se monta siempre (nunca hay mount/unmount al navegar) como un
 * `div` `position: absolute` dentro de un contenedor de ALTURA FIJA -- solo se anima su
 * `transform: translateY(...) scale(...)` y `opacity` según qué tan lejos está del
 * activo (`circularOffset`), con una única `transition` CSS. Nada de `AnimatePresence`
 * ni `layout` de framer-motion acá: ese enfoque (probado antes) dejaba que el alto
 * intrínseco del contenedor cambiara transitoriamente durante la navegación -- eso es
 * justo lo que el usuario reportó ("todo baja, me queda un espacio en blanco arriba... y
 * después se acomoda", "me muestra una barra lateral de scroll que me achica el
 * contenido"): con un contenedor de alto fijo y cards en `position: absolute`, el resto
 * de la página (`TimedSalaPage`, sticky, con su propio `max-h`/`overflow-y-auto` como
 * red de seguridad) ya no tiene ningún motivo para recalcular tamaño ni mostrar scroll
 * mientras gira -- el único "scroll" de este panel es el que gira el carrusel.
 *
 * Alto de card medido, no hardcodeado: a diferencia de la landing (imágenes de tamaño
 * fijo), acá el contenido es real (título, precio) así que en vez de asumir un alto de
 * píxeles fijo, se mide la card activa una vez montada (`ResizeObserver`) y esa altura
 * maneja tanto el contenedor como el `translateY` de cada card.
 *
 * Giro con scroll (pedido explícito, "que se pueda girar con un scroll dentro del
 * carrusel"): listener nativo de `wheel` (no el `onWheel` de React, que es pasivo por
 * defecto y no permite `preventDefault`) sobre el contenedor entero -- necesita
 * `preventDefault` para que el scroll ahí adentro gire el carrusel en vez de mover la
 * página/el panel que lo envuelve. Con throttle simple (una card por gesto de
 * rueda/trackpad) para que un scroll largo no dispare diez cards de una.
 *
 * Navegación circular (pedido explícito, "que gire en círculo completamente"): desde el
 * último lote, avanzar vuelve al primero, y desde el primero, retroceder va al último --
 * las flechas nunca se deshabilitan salvo que haya un único lote (no hay adonde girar).
 * Un click en la card de al lado salta directo a ese lote, flecha arriba/abajo del
 * teclado con el foco adentro del carrusel hace lo mismo, y también el scroll.
 */
export function LoteQueueList({ lotes, selectedLoteId, onSelect, leadingAmounts, currency }: LoteQueueListProps) {
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_H);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelLockedRef = useRef(false);

  const total = lotes.length;
  const hasLotes = total > 0;
  const activeIndex = hasLotes ? Math.max(0, lotes.findIndex((lote) => lote.id === selectedLoteId)) : 0;
  const canCycle = total > 1;

  function goToPrev() {
    if (!canCycle) return;
    onSelect(lotes[((activeIndex - 1) % total + total) % total].id);
  }

  function goToNext() {
    if (!canCycle) return;
    onSelect(lotes[(activeIndex + 1) % total].id);
  }

  // Mide la altura real de la card activa -- el `truncate` en título/precio asegura que
  // todas las cards tengan la misma altura, así que alcanza con medir una.
  useLayoutEffect(() => {
    const el = activeCardRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (!h) return;
      setCardHeight((prev) => (Math.abs(h - prev) > 0.5 ? h : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeIndex]);

  // Refs "en vivo" para el listener nativo de `wheel`: se registra una sola vez (ver
  // efecto abajo) pero necesita ver siempre el `goToNext`/`goToPrev`/`canCycle` del
  // render más reciente, no el del momento en que se registró.
  const goToNextRef = useRef(goToNext);
  goToNextRef.current = goToNext;
  const goToPrevRef = useRef(goToPrev);
  goToPrevRef.current = goToPrev;
  const canCycleRef = useRef(canCycle);
  canCycleRef.current = canCycle;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(event: WheelEvent) {
      if (!canCycleRef.current) return;
      if (Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      if (wheelLockedRef.current) return;
      wheelLockedRef.current = true;
      if (event.deltaY > 0) {
        goToNextRef.current();
      } else {
        goToPrevRef.current();
      }
      window.setTimeout(() => {
        wheelLockedRef.current = false;
      }, 560);
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // `hasLotes` (no `[]`): si el carrusel arranca vacío y el padre lo mantiene montado
    // hasta que llegan lotes (en vez de desmontar/remontar), el ref recién existe en ese
    // momento -- reenganchamos el listener nativo cuando eso pasa.
  }, [hasLotes]);

  if (!hasLotes) return null;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      goToPrev();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      goToNext();
    }
  }

  const slot = cardHeight + GAP;
  // Ventana de cards a la vista: 1 (sin anterior ni siguiente), 2 (con exactamente 2
  // lotes, "anterior" y "siguiente" son el mismo -- se muestra como siguiente, ver
  // `circularOffset`) o 3 (anterior/activa/siguiente). El contenedor solo reserva alto
  // para las que realmente existen -- si no, con 1 o 2 lotes quedaba un hueco en blanco
  // donde iría la card que falta (justo el bug que reportó el usuario).
  const visibleCount = Math.min(total, 3);
  const rowOffset = total >= 3 ? 1 : 0;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Selector de lote, ${activeIndex + 1} de ${total}`}
      onKeyDown={handleKeyDown}
      className="flex flex-col items-stretch gap-2"
    >
      <button
        type="button"
        aria-label="Lote anterior"
        disabled={!canCycle}
        onClick={goToPrev}
        className="flex h-6 w-full items-center justify-center rounded-md text-ink-faint transition-colors hover:enabled:bg-slate-50 hover:enabled:text-ink disabled:opacity-30"
      >
        <ChevronUp aria-hidden="true" className="h-4 w-4" />
      </button>

      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ height: visibleCount * cardHeight + (visibleCount - 1) * GAP }}
      >
        {lotes.map((lote, i) => {
          const offset = circularOffset(i, activeIndex, total);
          const isActive = offset === 0;
          const visible = Math.abs(offset) <= 1;

          return (
            <div
              key={lote.id}
              ref={isActive ? activeCardRef : undefined}
              aria-hidden={!visible}
              className="absolute inset-x-0 top-0"
              style={{
                transform: `translateY(${(offset + rowOffset) * slot}px) scale(${isActive ? 1 : 0.96})`,
                opacity: visible ? (isActive ? 1 : 0.82) : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transition: SPIN_TRANSITION,
              }}
            >
              <QueueCard
                lote={lote}
                leadingAmount={leadingAmounts[lote.id] ?? null}
                currency={currency}
                isActive={isActive}
                onClick={visible && !isActive ? () => onSelect(lote.id) : undefined}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Lote siguiente"
        disabled={!canCycle}
        onClick={goToNext}
        className="flex h-6 w-full items-center justify-center rounded-md text-ink-faint transition-colors hover:enabled:bg-slate-50 hover:enabled:text-ink disabled:opacity-30"
      >
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

interface QueueCardProps {
  lote: Lote;
  leadingAmount: string | null;
  currency: string;
  isActive: boolean;
  onClick?: () => void;
}

function QueueCard({ lote, leadingAmount, currency, isActive, onClick }: QueueCardProps) {
  const coverImage = lote.images[0]?.url;
  const priceInfo = buildPriceInfo(lote, leadingAmount, currency);
  const timeRemaining = formatTimeRemainingCompact(lote);

  const content = (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {coverImage ? (
          <img src={coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink">Lote {lote.lot_number}</p>
          {timeRemaining && <span className="shrink-0 text-xs font-medium text-warning-600">{timeRemaining}</span>}
        </div>
        <p className="truncate text-sm font-semibold text-ink">{lote.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-faint">
          Base: {formatCurrency(lote.base_price, currency)} · Inc: {formatCurrency(lote.min_increment, currency)}
        </p>
        <div className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5">
          <span className="text-[11px] text-ink-faint">{priceInfo.label}</span>
          <span className={clsx('font-mono text-sm font-bold tabular-nums', priceInfo.tone)}>{priceInfo.value}</span>
        </div>
      </div>
    </div>
  );

  const cardClassName = clsx(
    'w-full rounded-xl border bg-white p-3 text-left transition-colors',
    isActive
      ? 'border-brand-500 shadow-[0_0_0_3px_rgba(37,81,242,0.12),0_10px_24px_-12px_rgba(37,81,242,0.45)]'
      : 'border-line hover:border-brand-200',
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={`Ver lote: Lote ${lote.lot_number}, ${lote.title}`}
        onClick={onClick}
        className={cardClassName}
      >
        {content}
      </button>
    );
  }

  if (isActive) {
    return (
      <div
        role="option"
        aria-selected="true"
        aria-label={`Lote ${lote.lot_number}: ${lote.title}`}
        className={cardClassName}
      >
        {content}
      </div>
    );
  }

  // Card fuera de la ventana visible (anterior/siguiente del anterior/siguiente): sigue
  // montada -- para que la transición circular sea continua -- pero sin semántica
  // interactiva, ya está `aria-hidden` desde el wrapper.
  return <div className={cardClassName}>{content}</div>;
}
