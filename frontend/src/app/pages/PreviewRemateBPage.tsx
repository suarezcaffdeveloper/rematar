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
 * Vista previa B de la ficha de un remate: "mosaico". La portada se parte en dos: el
 * título y el botón para entrar a un lado, y un mosaico con las fotos de los primeros
 * lotes al otro. Los datos del remate (cuándo, tipo, dónde, garantía) son una franja de
 * cifras grandes, sin íconos ni cajas. Los lotes son una galería donde la foto manda: el
 * primero ocupa cuatro lugares, cada uno muestra su número, estado y precio, y al pasar el
 * mouse se despliega el incremento y la reserva. Tocar un lote abre un visor con todas sus
 * fotos. Datos de prueba, sin backend: `?estado=live|scheduled|paused|finished` y
 * `?tipo=timed`.
 */
export function PreviewRemateBPage() {
  const { remate, lotes, leadingAmounts } = useRemateMock();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Lote | null>(null);
  const [notLiveOpen, setNotLiveOpen] = useState(false);
  const isTimed = remate.auction_type === 'timed';
  const isNotYetLive = remate.status === 'draft' || remate.status === 'scheduled';
  const currency = remate.settings.currency;

  const counts = useMemo(() => {
    const map = new Map<LoteStatus, number>();
    for (const l of lotes) map.set(l.status, (map.get(l.status) ?? 0) + 1);
    return map;
  }, [lotes]);
  const visible = filter === 'all' ? lotes : lotes.filter((l) => l.status === filter);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="remates" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="group mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Remates
        </a>

        <Hero remate={remate} lotes={lotes} isTimed={isTimed} onEnter={() => isNotYetLive && setNotLiveOpen(true)} />

        <dl className="mt-12 grid border-y border-ink sm:grid-cols-2 lg:grid-cols-4">
          <FactCell label="Inicio" value={remate.starts_at ? formatDateTime(remate.starts_at) : 'A confirmar'} />
          <FactCell label="Tipo de remate" value={AUCTION_TYPE_LABELS[remate.auction_type ?? 'live']} />
          <FactCell label="Ubicación" value={remate.location ?? 'A confirmar'} />
          <FactCell
            label="Garantía para ofertar"
            value={
              remate.settings.guarantee_required
                ? remate.settings.guarantee_amount
                  ? formatCurrency(remate.settings.guarantee_amount, currency)
                  : 'Requerida'
                : 'No se requiere'
            }
          />
        </dl>

        <section aria-labelledby="sobre-title" className="mt-16 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
          <h2 id="sobre-title" className="text-2xl font-semibold tracking-tight">
            Sobre este remate
          </h2>
          <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-ink-muted">
            {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
          </p>
        </section>

        <section aria-labelledby="lotes-title" className="mt-20 pb-20">
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

          <ul className="mt-6 grid auto-rows-[15rem] grid-cols-2 gap-3 lg:grid-cols-4">
            {visible.map((lote, i) => (
              <LoteTile
                key={lote.id}
                lote={lote}
                currency={currency}
                big={i === 0 && visible.length > 2}
                isTimed={isTimed}
                leadingAmount={leadingAmounts[lote.id]}
                onOpen={() => setSelected(lote)}
              />
            ))}
          </ul>
        </section>
      </div>

      <LoteViewer lote={selected} currency={currency} onClose={() => setSelected(null)} />
      <RemateNotLiveDialog isOpen={notLiveOpen} onClose={() => setNotLiveOpen(false)} startsAt={remate.starts_at} />
    </div>
  );
}

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line px-0 py-6 last:border-b-0 sm:odd:pr-6 lg:border-b-0 lg:border-l lg:px-7 lg:first:border-l-0 lg:first:pl-0">
      <dd className="text-xl font-semibold leading-snug tracking-tight">{value}</dd>
      <dt className="mt-1 text-sm text-ink-muted">{label}</dt>
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

function Hero({
  remate,
  lotes,
  isTimed,
  onEnter,
}: {
  remate: Remate;
  lotes: Lote[];
  isTimed: boolean;
  onEnter: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const live = remate.status === 'live';
  const photos = lotes.slice(0, 3).map((l, i) => ({ url: l.images[0]?.url ?? remate.cover_image_url ?? '', position: positionFor(i) }));

  return (
    <section aria-label="Portada del remate" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-center lg:gap-16">
      <div>
        <p className="flex flex-wrap items-center gap-2.5 text-sm font-medium">
          {live ? <LiveDot /> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-500" />}
          <span className={live ? 'text-success-700' : 'text-brand-700'}>{STATUS_LABELS[remate.status]}</span>
          <span className="text-ink-faint">/</span>
          <span className="text-ink-muted">{CATEGORY_LABELS[remate.category]}</span>
          {isTimed && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Timed auction
            </span>
          )}
        </p>
        <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
          {remate.title}
        </h1>
        <button
          type="button"
          onClick={onEnter}
          className="group mt-9 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Entrar al remate
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </div>

      <div aria-hidden="true" className="grid h-[22rem] grid-cols-3 grid-rows-2 gap-2 sm:h-[26rem]">
        {photos.map((photo, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 * i }}
            className={`overflow-hidden rounded-2xl bg-surface-subtle ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
          >
            <img src={photo.url} alt="" style={{ objectPosition: photo.position }} className="h-full w-full object-cover" />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- lotes */

function LoteTile({
  lote,
  currency,
  big,
  isTimed,
  leadingAmount,
  onOpen,
}: {
  lote: Lote;
  currency: string;
  big: boolean;
  isTimed: boolean;
  leadingAmount: string | null | undefined;
  onOpen: () => void;
}) {
  const showTimed = isTimed && lote.status === 'open';
  const sold = lote.status === 'closed_sold' && lote.final_price;

  return (
    <li className={big ? 'col-span-2 row-span-2' : ''}>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`Lote ${lote.lot_number}: ${lote.title}`}
        className="group relative block h-full w-full overflow-hidden rounded-2xl bg-ink text-left text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <img
          src={lote.images[0]?.url}
          alt=""
          style={{ objectPosition: positionFor(lote.display_order) }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3.5">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tabular-nums text-ink backdrop-blur">
            Lote {lote.lot_number}
          </span>
          <span className={`rounded-full bg-white/90 px-3 py-1 text-xs font-medium backdrop-blur ${LOTE_TONE[lote.status]}`}>
            {LOTE_STATUS_LABELS[lote.status]}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className={`text-balance font-semibold leading-tight tracking-tight ${big ? 'text-2xl sm:text-3xl' : 'line-clamp-2 text-base sm:text-lg'}`}>
            {lote.title}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p>
              <span className="block text-xs text-white/70">
                {showTimed ? (leadingAmount != null ? 'Precio actual' : 'Base') : sold ? 'Vendido en' : 'Base'}
              </span>
              <span
                className={`block font-semibold tabular-nums tracking-tight ${big ? 'text-3xl' : 'text-xl'} ${
                  showTimed && leadingAmount != null ? 'text-success-300' : ''
                }`}
              >
                {formatCurrency(showTimed ? (leadingAmount ?? lote.base_price) : sold ? lote.final_price! : lote.base_price, currency)}
              </span>
            </p>
            {showTimed && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-sm text-ink">
                <LoteCountdown variant="inline" endsAt={lote.timer_ends_at} pausedRemainingSeconds={lote.timer_paused_remaining_seconds} />
              </span>
            )}
            {lote.images.length > 1 && !showTimed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-xs backdrop-blur">
                <Images className="h-3.5 w-3.5" aria-hidden="true" />
                {lote.images.length}
              </span>
            )}
          </div>
          {/* Se despliega al pasar el mouse o enfocar: el resto de los precios del lote. */}
          <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
            <p className="overflow-hidden text-sm text-white/80">
              <span className="block pt-2">
                Incremento {formatCurrency(lote.min_increment, currency)}
                {lote.reserve_price && !sold ? `, reserva ${formatCurrency(lote.reserve_price, currency)}` : ''}
              </span>
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------- visor */

function LoteViewer({ lote, currency, onClose }: { lote: Lote | null; currency: string; onClose: () => void }) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Lote ${lote.lot_number}: ${lote.title}`}
            className="relative grid max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative bg-ink">
              <img
                key={index}
                src={lote.images[index]?.url}
                alt={`Foto ${index + 1} de ${count}`}
                style={{ objectPosition: positionFor(index) }}
                className="aspect-[4/3] w-full object-cover lg:h-full lg:min-h-[30rem]"
              />
              {count > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onClick={() => setIndex((i) => (i - 1 + count) % count)}
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Foto siguiente"
                    onClick={() => setIndex((i) => (i + 1) % count)}
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 text-xs tabular-nums text-white backdrop-blur">
                    {index + 1} de {count}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="flex items-center gap-3 text-sm">
                <span className="tabular-nums text-ink-muted">Lote {lote.lot_number}</span>
                <span className={`font-medium ${LOTE_TONE[lote.status]}`}>{LOTE_STATUS_LABELS[lote.status]}</span>
              </p>
              <h2 className="-mt-2 text-balance text-3xl font-semibold leading-tight tracking-tight">{lote.title}</h2>
              {lote.description && <p className="leading-relaxed text-ink-muted">{lote.description}</p>}
              <dl className="mt-auto border-t border-ink">
                <Row label="Precio base" value={formatCurrency(lote.base_price, currency)} />
                <Row label="Incremento mínimo" value={formatCurrency(lote.min_increment, currency)} />
                {lote.reserve_price && <Row label="Reserva" value={formatCurrency(lote.reserve_price, currency)} />}
              </dl>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
