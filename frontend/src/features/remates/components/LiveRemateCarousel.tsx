import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatDateTime } from '../../../shared/lib/format';
import { useConnectedUsersCount, useLoteCount, useLoteCoverImages } from '../hooks';
import { CATEGORY_LABELS } from '../labels';
import type { Remate } from '../types';
import { LotesCollagePlaceholder } from './LotesCollagePlaceholder';
import { BoxIcon, CalendarIcon, PinIcon, UsersIcon } from './icons';

const GAP_PX = 16;

/** Fracción del ancho del contenedor que ocupa cada slide -- entre más ancho el
 * contenedor, más angosto en proporción, para que el "peek" de los remates vecinos se
 * note más en pantallas grandes (en mobile casi no hay lugar para asomar nada). */
function slideFraction(containerWidth: number): number {
  if (containerWidth >= 1024) return 0.6;
  if (containerWidth >= 640) return 0.72;
  return 0.86;
}

export interface LiveRemateCarouselProps {
  remates: Remate[];
}

/**
 * Carrusel "estilo Twitch" (pedido explícito, con referencia visual) de los remates en
 * vivo: uno centrado a tamaño completo, con un asomo de los vecinos a los costados,
 * deslizamiento circular al pasar de página -- sin cambiar la identidad visual del
 * resto del rediseño (tokens `ink`/`line`/`brand`, no la paleta oscura de la referencia).
 * Mismos datos que ya traía `CompradorDashboardPage` (`liveRemates`, ya cargados por
 * `useRemates`): no agrega ningún pedido nuevo al backend, salvo la cantidad de lotes
 * del remate activo (`useLoteCount`, mismo hook y mismo endpoint que ya usa `RemateCard`
 * en la grilla de abajo -- acá se pide una sola vez, para el remate centrado, no por
 * cada slide del carrusel).
 *
 * Loop circular real (no solo un índice que da la vuelta): el track incluye un clon del
 * último remate antes del primero y un clon del primero después del último. Avanzar
 * desde el último desliza hacia el clon del primero con la animación normal y, recién
 * al terminar (`onAnimationComplete`), se reubica sin transición sobre el remate real
 * -- invisible para quien mira, porque el clon y el real son pixel-idénticos. Mismo
 * truco que cualquier carrusel "infinito" estándar.
 */
export function LiveRemateCarousel({ remates }: LiveRemateCarouselProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = remates.length;
  const extended = count > 1 ? [remates[count - 1], ...remates, remates[0]] : remates;

  const [pos, setPos] = useState(count > 1 ? 1 : 0);
  const instantRef = useRef(false);
  // Traba de un paso por vez: sin esto, clickear la flecha más rápido de lo que tarda
  // el salto invisible del loop (`handleAnimationComplete`, más abajo) deja `pos`
  // avanzar varios pasos de más sin nunca reubicarse sobre un remate real -- el track
  // termina desplazado más allá del último slide renderizado (pantalla en blanco).
  // Mientras haya una transición en curso, se ignora cualquier click nuevo.
  const [isAnimating, setIsAnimating] = useState(false);

  // Defensivo: si el conteo de remates en vivo cambiara entre renders (hoy no pasa --
  // `useRemates` carga una sola vez), reancla `pos` para no quedar apuntando afuera de
  // `extended`.
  useEffect(() => {
    instantRef.current = true;
    setIsAnimating(false);
    setPos(count > 1 ? 1 : 0);
  }, [count]);

  function goToPos(next: number) {
    if (isAnimating || next === pos) return;
    setIsAnimating(true);
    instantRef.current = false;
    setPos(next);
  }

  function handleAnimationComplete() {
    if (count > 1) {
      if (pos === extended.length - 1) {
        instantRef.current = true;
        setPos(1);
        return;
      }
      if (pos === 0) {
        instantRef.current = true;
        setPos(count);
        return;
      }
    }
    setIsAnimating(false);
  }

  const activeRealIndex = count > 1 ? ((pos - 1 + count) % count) : 0;
  const activeRemateId = remates[activeRealIndex]?.id ?? '';
  const loteCount = useLoteCount(activeRemateId);
  const connectedUsers = useConnectedUsersCount(activeRemateId);

  if (count === 0) return null;

  const slideWidth = Math.round(containerWidth * slideFraction(containerWidth));
  const offset = containerWidth / 2 - slideWidth / 2 - pos * (slideWidth + GAP_PX);

  return (
    <div className="flex flex-col gap-3">
      {/* `isolate`: crea un stacking context propio para el carrusel -- sin esto, el
       * `zIndex` que Framer Motion aplica al slide activo (10) y el `z-20` de las
       * flechas compiten directamente, en el contexto raíz de la página, contra el
       * `z-20` del riel del Sidebar y el `z-10` del Header (que contiene el panel de
       * notificaciones). Como esos números empatan o incluso ganan por orden de DOM
       * (el carrusel se pinta después en el árbol), el Sidebar expandido y el panel de
       * notificaciones terminaban por debajo de las flechas. Aislando el carrusel, sus
       * z-index internos (slide activo, flechas) solo se comparan entre sí -- el
       * contenedor en sí no tiene z-index propio, así que en el contexto raíz queda
       * siempre por debajo de cualquier capa con z-index explícito (Sidebar, Header). */}
      <div ref={containerRef} className="relative isolate overflow-hidden">
        <motion.div
          className="flex"
          style={{ gap: GAP_PX }}
          animate={{ x: offset }}
          transition={
            instantRef.current || prefersReducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 320, damping: 34 }
          }
          onAnimationComplete={handleAnimationComplete}
        >
          {extended.map((remate, i) => (
            <LiveSlide
              key={`${remate.id}-${i}`}
              remate={remate}
              width={slideWidth}
              active={count > 1 ? i === pos : true}
              loteCount={loteCount}
              connectedUsers={connectedUsers}
              prefersReducedMotion={Boolean(prefersReducedMotion)}
              onSelect={() => goToPos(i)}
              onNavigate={() => navigate(`/remates/${remate.id}/sala`)}
            />
          ))}
        </motion.div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Remate en vivo anterior"
              disabled={isAnimating}
              onClick={() => goToPos(pos - 1)}
              className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Siguiente remate en vivo"
              disabled={isAnimating}
              onClick={() => goToPos(pos + 1)}
              className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {remates.map((remate, i) => (
            <button
              key={remate.id}
              type="button"
              aria-label={`Ir al remate en vivo ${i + 1}`}
              aria-current={i === activeRealIndex}
              onClick={() => goToPos(i + 1)}
              className={
                i === activeRealIndex
                  ? 'h-2 w-6 rounded-full bg-brand-600 transition-all'
                  : 'h-2 w-2 rounded-full bg-line-strong transition-all hover:bg-ink-faint'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LiveSlideProps {
  remate: Remate;
  width: number;
  active: boolean;
  loteCount: number | null;
  connectedUsers: number | null;
  prefersReducedMotion: boolean;
  onSelect: () => void;
  onNavigate: () => void;
}

/** Cada slide "se pone al frente" cuando pasa a estar activo -- mismo tamaño de caja
 * (`width`, controlado por el carrusel para que las cuentas de centrado no cambien) pero
 * escalado a más tamaño + opacidad plena + por encima de los vecinos (`zIndex`), en vez
 * de una tarjeta lateral apagada. Los vecinos se achican y atenúan un poco -- pedido
 * explícito ("que tenga como un movimiento de ponerse al frente"). */
function LiveSlide({
  remate,
  width,
  active,
  loteCount,
  connectedUsers,
  prefersReducedMotion,
  onSelect,
  onNavigate,
}: LiveSlideProps) {
  // Mismo respaldo que `RemateCard`: sin `cover_image_url` propio, un collage con la
  // primera imagen de hasta 4 lotes en vez del degradé genérico -- antes esta pieza
  // caía directo a `CoverPlaceholder` sin intentarlo, por eso remates sin portada
  // propia parecían "sin imagen" acá aunque sí se veían con foto en la grilla de abajo.
  const loteCoverImages = useLoteCoverImages(remate.id);

  const badge = (
    <div className="absolute left-3 top-3">
      <Badge variant="success">En vivo</Badge>
    </div>
  );

  return (
    <motion.div
      style={{ width }}
      className="relative shrink-0"
      animate={{ scale: active ? 1.04 : 0.88, opacity: active ? 1 : 0.65, zIndex: active ? 10 : 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
    >
      {active ? (
        <div className="flex h-64 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg sm:h-72">
          <div className="relative h-full w-3/5 shrink-0 overflow-hidden">
            {remate.cover_image_url ? (
              <img src={remate.cover_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <LotesCollagePlaceholder images={loteCoverImages ?? []} className="h-full w-full" />
            )}
            {badge}
          </div>

          {/* `pb` generoso para que el texto nunca quede debajo del botón, que se ancla
           * aparte, abajo a la derecha (pedido explícito) -- no dentro del flujo del
           * `flex-col` de arriba. */}
          <div className="relative flex min-w-0 flex-1 flex-col gap-2 p-4 pb-14 sm:gap-2.5 sm:p-6 sm:pb-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                {CATEGORY_LABELS[remate.category]}
              </p>
              <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-ink sm:mt-1.5 sm:text-xl">
                {remate.title}
              </h3>
            </div>
            <dl className="hidden flex-col gap-1.5 text-sm text-ink-muted sm:flex">
              {remate.starts_at && (
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span>{formatDateTime(remate.starts_at)}</span>
                </div>
              )}
              {remate.location && (
                <div className="flex items-center gap-2">
                  <PinIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="truncate">{remate.location}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                <span>
                  {connectedUsers === null
                    ? 'Cargando conectados…'
                    : `${connectedUsers} ${connectedUsers === 1 ? 'conectado' : 'conectados'}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <BoxIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                <span>
                  {loteCount === null ? 'Cargando lotes…' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}
                </span>
              </div>
            </dl>
            <Button
              variant="hero"
              className="absolute bottom-3 right-3 w-fit gap-1.5 sm:bottom-5 sm:right-5"
              onClick={onNavigate}
            >
              Entrar a la sala
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Centrar "${remate.title}" en el carrusel`}
          className="relative block h-64 w-full overflow-hidden rounded-xl border border-line transition-shadow hover:shadow-md sm:h-72"
        >
          {remate.cover_image_url ? (
            <img src={remate.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <LotesCollagePlaceholder images={loteCoverImages ?? []} className="h-full w-full" />
          )}
          {badge}
        </button>
      )}
    </motion.div>
  );
}
