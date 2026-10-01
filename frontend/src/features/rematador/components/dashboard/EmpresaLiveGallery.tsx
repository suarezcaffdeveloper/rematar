import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import { RemateCover } from '../../../remates/components/home/RemateCover';
import { useLoteCount, useRemateLiveSnapshot } from '../../../remates/hooks';
import { CATEGORY_SHORT_LABELS } from '../../../remates/labels';
import type { Remate } from '../../../remates/types';
import { isTimed } from '../../dashboard';
import { RemateStatusPill } from './RemateStatusPill';

/** Más de esto y cada tira quedaría demasiado angosta para leer su título girado. */
export const MAX_EMPRESA_GALLERY_PANELS = 6;
const TIMED_TICK_MS = 30_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(endsAt: string, now: number): string {
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return 'Cerrando…';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return [days ? `${days} d` : null, `${hours} h`, `${String(minutes).padStart(2, '0')} min`].filter(Boolean).join(' ');
}

/**
 * Los remates de la empresa que están corriendo ahora (en vivo o pausados), como un
 * acordeón de paneles -- el mismo patrón que `LiveGallery` del comprador, pero pensado para
 * quien administra: muestra el precio vigente (en vivo) o la cuenta regresiva (Timed), los
 * conectados, y lleva a "Administrar" en vez de a la sala. No rota solo: quien monitorea
 * decide qué panel mirar.
 */
export function EmpresaLiveGallery({ remates }: { remates: Remate[] }) {
  const panels = remates.slice(0, MAX_EMPRESA_GALLERY_PANELS);
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, panels.length - 1);

  return (
    <section aria-label="Remates en curso" className="flex h-[38rem] flex-col gap-2.5 lg:h-[34rem] lg:flex-row">
      {panels.map((remate, index) => (
        <GalleryPanel key={remate.id} remate={remate} isActive={index === safeActive} onActivate={() => setActive(index)} />
      ))}
    </section>
  );
}

function GalleryPanel({ remate, isActive, onActivate }: { remate: Remate; isActive: boolean; onActivate: () => void }) {
  const timed = isTimed(remate);
  const snapshot = useRemateLiveSnapshot(isActive ? remate.id : '');
  const now = useNow(TIMED_TICK_MS);
  const lote = snapshot?.active_lote ?? null;
  const offer = snapshot?.winning_offer ?? null;
  const price = lote ? (offer?.amount ?? lote.base_price) : null;

  return (
    <article
      onMouseEnter={onActivate}
      className={`relative min-h-0 min-w-0 basis-0 overflow-hidden rounded-3xl bg-ink transition-[flex-grow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isActive ? 'grow-[7]' : 'grow-[1]'
      }`}
    >
      <div className={`absolute inset-0 transition-transform duration-[1200ms] ease-out ${isActive ? 'scale-100' : 'scale-110'}`}>
        <RemateCover remate={remate} className="h-full w-full" />
      </div>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          isActive ? 'bg-gradient-to-t from-ink/90 via-ink/25 to-transparent' : 'bg-ink/55'
        }`}
      />

      <div
        className={`absolute inset-0 flex items-center gap-3 p-4 transition-opacity duration-300 lg:flex-col lg:justify-end lg:pb-6 ${
          isActive ? 'pointer-events-none opacity-0' : 'opacity-100 delay-300'
        }`}
        aria-hidden={isActive}
      >
        <span className="line-clamp-1 text-sm font-medium text-white lg:rotate-180 lg:text-base lg:[writing-mode:vertical-rl]">
          {remate.title}
        </span>
      </div>
      {!isActive && (
        <button
          type="button"
          aria-label={`Ver ${remate.title}`}
          onClick={onActivate}
          className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        />
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-3.5 p-5 text-white transition-all duration-500 sm:p-8 ${
          isActive ? 'translate-y-0 opacity-100 delay-300' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        aria-hidden={!isActive}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
          <RemateStatusPill remate={remate} onDark />
          <span>{CATEGORY_SHORT_LABELS[remate.category]}</span>
        </div>
        <h3 className="max-w-xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{remate.title}</h3>

        <div className="min-h-[4.5rem]">
          {timed && remate.ends_at ? (
            <>
              <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{formatCountdown(remate.ends_at, now)}</p>
              <p className="mt-1 text-sm text-white/70">para el cierre</p>
            </>
          ) : lote && price !== null ? (
            <>
              <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
                <PriceFlash amount={price} currency={remate.settings.currency} />
              </p>
              <p className="mt-1 text-sm text-white/70">
                Lote {lote.lot_number}: {lote.title} · {offer ? 'oferta actual' : 'precio base'}
              </p>
            </>
          ) : (
            isActive && <LotesFallback remate={remate} />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {snapshot && (
            <p className="text-sm tabular-nums text-white/80">
              {snapshot.connected_users} {snapshot.connected_users === 1 ? 'conectado' : 'conectados'}
            </p>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              to={`/remates/${remate.id}`}
              tabIndex={isActive ? 0 : -1}
              className="inline-flex items-center rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Ver como comprador
            </Link>
            <Link
              to={`/remates/${remate.id}/gestionar`}
              tabIndex={isActive ? 0 : -1}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Administrar
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Precio con el mismo destello verde que ve el comprador cuando entra una oferta. */
function PriceFlash({ amount, currency }: { amount: string; currency: string }) {
  return (
    <motion.span key={amount} initial={{ color: '#86efac' }} animate={{ color: '#ffffff' }} transition={{ duration: 0.6 }}>
      {formatCurrency(amount, currency)}
    </motion.span>
  );
}

function LotesFallback({ remate }: { remate: Remate }) {
  const loteCount = useLoteCount(remate.id);
  return (
    <p className="text-base text-white/80">
      {[remate.location, loteCount === null ? null : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`].filter(Boolean).join(', ') ||
        'Sin lote abierto todavía'}
    </p>
  );
}
