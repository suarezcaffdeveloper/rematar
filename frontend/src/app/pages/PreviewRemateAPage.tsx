import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Images, Timer, X } from 'lucide-react';
import { RemateNotLiveDialog } from '../../features/remates/components/RemateNotLiveDialog';
import {
  AUCTION_TYPE_LABELS,
  CATEGORY_LABELS,
  LOTE_STATUS_LABELS,
  STATUS_LABELS,
} from '../../features/remates/labels';
import type { Lote, LoteStatus, Remate } from '../../features/remates/types';
import { LoteCountdown } from '../../features/sala/components/LoteCountdown';
import { formatCurrency, formatDateTime } from '../../shared/lib/format';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import { LiveDot } from './previewInicio/shared';
import { positionFor, useRemateMock } from './previewRemate/mock';

const LOTE_TONE: Record<LoteStatus, string> = {
  pending: 'text-brand-700',
  open: 'text-success-700',
  closed_sold: 'text-ink-muted',
  closed_unsold: 'text-ink-faint',
  cancelled: 'text-danger-600',
};

type Filter = 'all' | LoteStatus;

/**
 * Vista previa A de la ficha de un remate: "catálogo". Arriba, una portada oscura con el
 * título, cuándo y dónde, y el botón para entrar (mismo lenguaje que la galería del
 * inicio); abajo, a la izquierda, los lotes como un índice -- una fila por lote con su
 * foto, sus precios y su estado -- y a la derecha una columna fija con la descripción y
 * los detalles del remate. Tocar un lote abre un panel lateral con todas sus fotos. Datos
 * de prueba, sin backend: `?estado=live|scheduled|paused|finished` y `?tipo=timed`.
 */
export function PreviewRemateAPage() {
  const { remate, lotes, leadingAmounts } = useRemateMock();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Lote | null>(null);
  const [notLiveOpen, setNotLiveOpen] = useState(false);
  const isTimed = remate.auction_type === 'timed';
  const isNotYetLive = remate.status === 'draft' || remate.status === 'scheduled';

  const counts = useMemo(() => {
    const map = new Map<LoteStatus, number>();
    for (const l of lotes) map.set(l.status, (map.get(l.status) ?? 0) + 1);
    return map;
  }, [lotes]);
  const visible = filter === 'all' ? lotes : lotes.filter((l) => l.status === filter);

  function enter() {
    if (isNotYetLive) setNotLiveOpen(true);
  }

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="remates" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="group mb-5 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Remates
        </a>

        <Hero remate={remate} isTimed={isTimed} onEnter={enter} />

        <div className="mt-14 grid gap-14 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
          <section aria-labelledby="lotes-title" className="min-w-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="lotes-title" className="text-2xl font-semibold tracking-tight">
                  Lotes de este remate
                </h2>
                <p className="mt-1 text-ink-muted">Tocá un lote para ver todas sus fotos.</p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar lotes por estado">
                <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
                  Todos <span className="tabular-nums opacity-60">{lotes.length}</span>
                </Chip>
                {(['open', 'pending', 'closed_sold', 'closed_unsold'] as LoteStatus[])
                  .filter((s) => (counts.get(s) ?? 0) > 0)
                  .map((s) => (
                    <Chip key={s} selected={filter === s} onClick={() => setFilter(s)}>
                      {LOTE_STATUS_LABELS[s]} <span className="tabular-nums opacity-60">{counts.get(s)}</span>
                    </Chip>
                  ))}
              </div>
            </div>

            <ul className="mt-6 border-t border-ink">
              {visible.map((lote) => (
                <LoteRow
                  key={lote.id}
                  lote={lote}
                  currency={remate.settings.currency}
                  isTimed={isTimed}
                  leadingAmount={leadingAmounts[lote.id]}
                  onOpen={() => setSelected(lote)}
                />
              ))}
            </ul>
          </section>

          <aside aria-label="Sobre el remate" className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-lg font-semibold tracking-tight">Sobre este remate</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
            </p>

            <dl className="mt-8 border-t border-ink">
              <Fact label="Tipo de remate" value={AUCTION_TYPE_LABELS[remate.auction_type ?? 'live']} />
              {remate.starts_at && <Fact label="Inicio" value={formatDateTime(remate.starts_at)} />}
              {remate.location && <Fact label="Ubicación" value={remate.location} />}
              <Fact
                label="Garantía para ofertar"
                value={
                  remate.settings.guarantee_required
                    ? remate.settings.guarantee_amount
                      ? formatCurrency(remate.settings.guarantee_amount, remate.settings.currency)
                      : 'Requerida'
                    : 'No se requiere'
                }
              />
            </dl>
          </aside>
        </div>
      </div>

      <LoteSheet lote={selected} currency={remate.settings.currency} onClose={() => setSelected(null)} />
      <RemateNotLiveDialog isOpen={notLiveOpen} onClose={() => setNotLiveOpen(false)} startsAt={remate.starts_at} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        selected ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink-faint'
      }`}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------- portada */

function Hero({ remate, isTimed, onEnter }: { remate: Remate; isTimed: boolean; onEnter: () => void }) {
  const live = remate.status === 'live';
  return (
    <section aria-label="Portada del remate" className="relative min-h-[24rem] overflow-hidden rounded-2xl bg-ink text-white lg:h-[27rem]">
      {remate.cover_image_url && (
        <img src={remate.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-transparent" />

      {isTimed && (
        <p className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-sm font-semibold text-ink backdrop-blur">
          <Timer className="h-4 w-4" aria-hidden="true" /> Timed auction
        </p>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:p-10">
        <p className="flex items-center gap-2.5 text-sm font-medium text-white/90">
          {live ? <LiveDot /> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-300" />}
          {STATUS_LABELS[remate.status]}
          <span className="text-white/40">/</span>
          {CATEGORY_LABELS[remate.category]}
        </p>
        <h1 className="max-w-4xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          {remate.title}
        </h1>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <p className="text-base text-white/80">
            {remate.starts_at && formatDateTime(remate.starts_at)}
            {remate.starts_at && remate.location ? ', ' : ''}
            {remate.location}
          </p>
          <button
            type="button"
            onClick={onEnter}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Entrar al remate
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- lotes */

function LoteRow({
  lote,
  currency,
  isTimed,
  leadingAmount,
  onOpen,
}: {
  lote: Lote;
  currency: string;
  isTimed: boolean;
  leadingAmount: string | null | undefined;
  onOpen: () => void;
}) {
  const showTimed = isTimed && lote.status === 'open';
  const sold = lote.status === 'closed_sold' && lote.final_price;

  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="group grid w-full grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-5 gap-y-3 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:grid-cols-[8rem_minmax(0,1fr)_14rem] sm:gap-x-7"
      >
        <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-subtle">
          <img
            src={lote.images[0]?.url}
            alt=""
            style={{ objectPosition: positionFor(0) }}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {lote.images.length > 1 && (
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <Images className="h-3 w-3" aria-hidden="true" />
              {lote.images.length}
            </span>
          )}
        </span>

        <span className="min-w-0">
          <span className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-ink-muted">Lote {lote.lot_number}</span>
            <span className={`font-medium ${LOTE_TONE[lote.status]}`}>{LOTE_STATUS_LABELS[lote.status]}</span>
          </span>
          <span className="mt-0.5 block text-xl font-medium leading-snug tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
            {lote.title}
          </span>
          {lote.description && <span className="mt-1 line-clamp-1 block text-sm text-ink-muted">{lote.description}</span>}
        </span>

        <span className="col-span-2 flex flex-row items-end justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:text-right">
          {showTimed ? (
            <span>
              <span className="block text-xs text-ink-muted">{leadingAmount != null ? 'Precio actual' : 'Base'}</span>
              <span className={`block text-2xl font-semibold tabular-nums tracking-tight ${leadingAmount != null ? 'text-success-700' : ''}`}>
                {formatCurrency(leadingAmount ?? lote.base_price, currency)}
              </span>
              <span className="mt-1 block text-sm">
                <LoteCountdown variant="inline" endsAt={lote.timer_ends_at} pausedRemainingSeconds={lote.timer_paused_remaining_seconds} />
              </span>
            </span>
          ) : (
            <span>
              <span className="block text-xs text-ink-muted">{sold ? 'Vendido en' : 'Base'}</span>
              <span className="block text-2xl font-semibold tabular-nums tracking-tight">
                {formatCurrency(sold ? lote.final_price! : lote.base_price, currency)}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                Incremento {formatCurrency(lote.min_increment, currency)}
              </span>
              {lote.reserve_price && !sold && (
                <span className="block text-sm text-ink-muted">Reserva {formatCurrency(lote.reserve_price, currency)}</span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------ panel de un lote */

function LoteSheet({ lote, currency, onClose }: { lote: Lote | null; currency: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const count = lote?.images.length ?? 0;

  useEffect(() => setIndex(0), [lote?.id]);

  useEffect(() => {
    if (!lote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && count > 1) setIndex((i) => (i + 1) % count);
      if (e.key === 'ArrowLeft' && count > 1) setIndex((i) => (i - 1 + count) % count);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lote, onClose, count]);

  return (
    <AnimatePresence>
      {lote && (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Fotos y datos del lote ${lote.lot_number}`}
            className="fixed right-0 top-0 z-50 flex h-full w-[min(32rem,100vw)] flex-col overflow-y-auto bg-white shadow-2xl"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
          >
            <div className="relative aspect-[4/3] shrink-0 bg-surface-subtle">
              <img
                key={index}
                src={lote.images[index]?.url}
                alt={`Foto ${index + 1} de ${count}`}
                style={{ objectPosition: positionFor(index) }}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              {count > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onClick={() => setIndex((i) => (i - 1 + count) % count)}
                    className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Foto siguiente"
                    onClick={() => setIndex((i) => (i + 1) % count)}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {count > 1 && (
              <div className="flex gap-2 px-6 pt-4 sm:px-8">
                {lote.images.map((image, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Ver foto ${i + 1}`}
                    aria-pressed={index === i}
                    className={`h-14 w-20 overflow-hidden rounded-lg ring-offset-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      index === i ? 'ring-2 ring-ink' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={image.url} alt="" style={{ objectPosition: positionFor(i) }} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <div>
                <p className="flex items-center gap-3 text-sm">
                  <span className="tabular-nums text-ink-muted">Lote {lote.lot_number}</span>
                  <span className={`font-medium ${LOTE_TONE[lote.status]}`}>{LOTE_STATUS_LABELS[lote.status]}</span>
                </p>
                <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{lote.title}</h2>
              </div>
              {lote.description && <p className="leading-relaxed text-ink-muted">{lote.description}</p>}
              <dl className="border-t border-ink">
                <Fact label="Precio base" value={formatCurrency(lote.base_price, currency)} />
                <Fact label="Incremento mínimo" value={formatCurrency(lote.min_increment, currency)} />
                {lote.reserve_price && <Fact label="Reserva" value={formatCurrency(lote.reserve_price, currency)} />}
              </dl>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
