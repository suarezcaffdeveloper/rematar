import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import { useLoteCount, useRemateLiveSnapshot } from '../../hooks';
import { CATEGORY_SHORT_LABELS } from '../../labels';
import type { Remate } from '../../types';
import { LiveDot } from './LiveDot';
import { RemateCover } from './RemateCover';

const ROTATE_MS = 7000;
/** Más de esto y cada tira quedaría demasiado angosta para leer su título girado; el
 * resto de los remates en vivo sigue apareciendo en el índice de abajo. */
export const MAX_GALLERY_PANELS = 8;

export interface LiveGalleryProps {
  remates: Remate[];
}

/**
 * Galería de remates en vivo: paneles que se abren como un acordeón. El activo se expande
 * y muestra el lote en el martillo con su oferta vigente; los demás quedan como tiras con
 * el título girado (en mobile, apiladas en vertical con el título horizontal). Rota sola
 * cada `ROTATE_MS`, salvo con el mouse encima, el foco adentro o `prefers-reduced-motion`.
 */
export function LiveGallery({ remates }: LiveGalleryProps) {
  const reduceMotion = useReducedMotion();
  const panels = remates.slice(0, MAX_GALLERY_PANELS);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);

  // Si la lista se achica (recarga), no queda apuntando a un panel que ya no existe.
  const safeActive = Math.min(active, panels.length - 1);

  useEffect(() => {
    if (engaged || reduceMotion || panels.length < 2) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % panels.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [engaged, reduceMotion, panels.length, safeActive]);

  return (
    <section
      aria-label="Remates en vivo"
      className="flex h-[38rem] flex-col gap-2 lg:h-[34rem] lg:flex-row"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
      }}
    >
      {panels.map((remate, i) => (
        <GalleryPanel
          key={remate.id}
          remate={remate}
          isActive={i === safeActive}
          onActivate={() => setActive(i)}
        />
      ))}
    </section>
  );
}

function GalleryPanel({
  remate,
  isActive,
  onActivate,
}: {
  remate: Remate;
  isActive: boolean;
  onActivate: () => void;
}) {
  // Solo el panel abierto consulta el snapshot (un pedido cada pocos segundos).
  const snapshot = useRemateLiveSnapshot(isActive ? remate.id : '');
  const lote = snapshot?.active_lote ?? null;
  const offer = snapshot?.winning_offer ?? null;
  const price = lote ? (offer?.amount ?? lote.base_price) : null;

  return (
    <article
      onMouseEnter={onActivate}
      className={`relative min-h-0 min-w-0 basis-0 overflow-hidden rounded-2xl bg-ink transition-[flex-grow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isActive ? 'grow-[7]' : 'grow-[1]'
      }`}
    >
      <div
        className={`absolute inset-0 transition-transform duration-[1200ms] ease-out ${
          isActive ? 'scale-100' : 'scale-110'
        }`}
      >
        <RemateCover remate={remate} className="h-full w-full" eager width={900} />
      </div>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          isActive ? 'bg-gradient-to-t from-ink/90 via-ink/25 to-transparent' : 'bg-ink/55'
        }`}
      />

      {/* Tira colapsada: título girado en escritorio, horizontal en mobile. */}
      <div
        className={`absolute inset-0 flex items-center gap-3 p-4 transition-opacity duration-300 lg:flex-col lg:justify-end lg:pb-6 ${
          isActive ? 'pointer-events-none opacity-0' : 'opacity-100 delay-300'
        }`}
        aria-hidden={isActive}
      >
        <LiveDot className="shrink-0 lg:mb-auto" />
        <span className="line-clamp-1 text-sm font-medium text-white lg:rotate-180 lg:text-base lg:[writing-mode:vertical-rl]">
          {remate.title}
        </span>
      </div>
      {!isActive && (
        <button
          type="button"
          aria-label={`Abrir ${remate.title}`}
          onClick={onActivate}
          className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        />
      )}

      {/* Panel abierto. */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 text-white transition-all duration-500 sm:p-8 ${
          isActive ? 'translate-y-0 opacity-100 delay-300' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        aria-hidden={!isActive}
      >
        <p className="flex items-center gap-2 text-sm text-white/80">
          <LiveDot /> En vivo
          <span className="text-white/40">/</span>
          {CATEGORY_SHORT_LABELS[remate.category]}
          {snapshot && (
            <>
              <span className="hidden text-white/40 sm:inline">/</span>
              <span className="hidden sm:inline">
                {snapshot.connected_users} {snapshot.connected_users === 1 ? 'conectado' : 'conectados'}
              </span>
            </>
          )}
        </p>
        <h2 className="max-w-xl text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {remate.title}
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-h-[3.75rem]">
            {lote && price !== null ? (
              <>
                <p className="text-sm text-white/65">
                  Lote {lote.lot_number}: {lote.title}
                </p>
                <LivePrice amount={price} currency={remate.settings.currency} isOffer={offer !== null} />
              </>
            ) : (
              isActive && <LotesFallback remate={remate} />
            )}
          </div>
          <Link
            to={`/remates/${remate.id}/sala`}
            tabIndex={isActive ? 0 : -1}
            className="group inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Entrar a la sala
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Precio vigente del lote en el martillo: destello verde cuando cambia (nueva oferta). */
function LivePrice({ amount, currency, isOffer }: { amount: string; currency: string; isOffer: boolean }) {
  const previous = useRef<string | null>(null);
  const changed = previous.current !== null && previous.current !== amount;
  useEffect(() => {
    previous.current = amount;
  }, [amount]);

  return (
    <p className="mt-1 flex items-baseline gap-3">
      <motion.span
        key={amount}
        className="text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl"
        initial={changed ? { color: '#86efac', scale: 1.04 } : false}
        animate={{ color: '#ffffff', scale: 1 }}
        style={{ transformOrigin: 'left' }}
        transition={{ duration: 0.6 }}
      >
        {formatCurrency(amount, currency)}
      </motion.span>
      <span className="text-sm text-white/65">{isOffer ? 'oferta actual' : 'precio base'}</span>
    </p>
  );
}

/** Sin lote en el martillo todavía (o sin snapshot): lugar y cantidad de lotes. */
function LotesFallback({ remate }: { remate: Remate }) {
  const loteCount = useLoteCount(remate.id, remate.lote_count);
  return (
    <p className="text-sm text-white/80">
      {[
        remate.location,
        loteCount === null ? null : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`,
      ]
        .filter(Boolean)
        .join(', ')}
    </p>
  );
}
