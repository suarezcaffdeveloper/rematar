import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { getStatusCopy } from '../../features/postauction/buyerStatusCopy';
import { describeTimelineAction, STATUS_LABELS, STATUS_ORDER } from '../../features/postauction/labels';
import type { PostAuctionCaseDetail, PostAuctionStatus, TimelineEntry } from '../../features/postauction/types';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import { formatShortDate, money, statusTone } from './previewCompras/shared';
import { buildDetalle, DETALLE_IMAGES, parseEstado, stepDate } from './previewCompraDetalle/mock';

const hourFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });

/**
 * Vista previa A del detalle de una compra: "hoja de compra". Arriba, la foto del lote en
 * grande con el estado y el precio; abajo, a la izquierda el recorrido de 8 pasos con la
 * fecha de cada uno, lo que sigue, las observaciones del martillero y el historial; a la
 * derecha, una columna fija con el resumen económico y los responsables. Datos de prueba,
 * sin backend: `?estado=pago_pendiente` (o cualquiera de los 8) cambia el estado.
 */
export function PreviewDetalleAPage() {
  const [searchParams] = useSearchParams();
  const status = parseEstado(searchParams.get('estado'));
  const detalle = useMemo(() => buildDetalle(status), [status]);
  const copy = getStatusCopy(detalle);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const notes = detalle.timeline.filter((e) => e.action === 'note_added');
  const history = detalle.timeline.filter((e) => e.action !== 'note_added' && e.action !== 'notification_failed');
  const needsPayment = status === 'pago_pendiente';

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="compras" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="group mb-5 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Mis compras
        </a>

        <section
          aria-label="Resumen de la compra"
          className="relative min-h-[24rem] overflow-hidden rounded-2xl bg-ink text-white lg:h-[26rem]"
        >
          <img src={DETALLE_IMAGES[0].url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-transparent" />

          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink backdrop-blur transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Images className="h-4 w-4" aria-hidden="true" />
            Ver fotos del lote
          </button>

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 sm:p-10">
            <p className="flex items-center gap-2.5 text-sm font-medium text-white/90">
              <span className="relative inline-flex h-2 w-2" aria-hidden="true">
                {needsPayment && <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-75" />}
                <span className={`relative h-2 w-2 rounded-full ${needsPayment ? 'bg-warning-400' : 'bg-brand-300'}`} />
              </span>
              {STATUS_LABELS[status]}
            </p>
            <h1 className="max-w-4xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              {detalle.lote_title}
            </h1>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <p className="max-w-xl text-base text-white/80">{copy.headline}</p>
              <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{money(detalle.final_price)}</p>
            </div>
          </div>
        </section>

        <div className="mt-14 grid gap-14 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
          <div className="flex min-w-0 flex-col gap-16">
            <section aria-labelledby="recorrido-title">
              <h2 id="recorrido-title" className="mb-8 text-2xl font-semibold tracking-tight">
                Recorrido
              </h2>
              <Track detalle={detalle} />
              <div className="mt-10 border-l-2 border-brand-600 pl-5">
                <p className="text-lg font-semibold tracking-tight">{copy.nextStepTitle}</p>
                <p className="mt-1 max-w-2xl leading-relaxed text-ink-muted">{copy.nextStepDescription}</p>
              </div>
            </section>

            {notes.length > 0 && (
              <section aria-labelledby="notas-title">
                <h2 id="notas-title" className="mb-6 text-2xl font-semibold tracking-tight">
                  Observaciones del martillero
                </h2>
                <ul className="border-t border-ink">
                  {notes.map((note) => (
                    <li key={note.id} className="border-b border-line py-6">
                      <blockquote className="max-w-2xl text-xl leading-snug tracking-tight">{note.note}</blockquote>
                      <p className="mt-3 text-sm text-ink-muted">
                        {note.actor_name ?? 'Martillero'}, {formatShortDate(note.occurred_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="historial-title">
              <h2 id="historial-title" className="mb-6 text-2xl font-semibold tracking-tight">
                Historial
              </h2>
              <History entries={history} />
            </section>
          </div>

          <aside aria-label="Datos de la compra" className="lg:sticky lg:top-24 lg:self-start">
            <dl className="border-t border-ink">
              <Row label="Precio final" value={<span className="text-2xl font-semibold tabular-nums tracking-tight">{money(detalle.final_price)}</span>} />
              <Row label="Precio base" value={money(detalle.base_price)} />
              <Row label="Adjudicado el" value={formatShortDate(detalle.created_at)} />
              <Row label="Remate" value={detalle.remate_title} />
              <Row label="Lote" value={`Lote ${detalle.lot_number}`} />
            </dl>
            <h2 className="mb-1 mt-10 text-lg font-semibold tracking-tight">Responsables</h2>
            <dl className="border-t border-ink">
              <Row label="Martillero" value={detalle.operador_name ?? detalle.rematador_name ?? '-'} />
              {detalle.empresa_name && detalle.empresa_name !== detalle.operador_name && (
                <Row label="Empresa" value={detalle.empresa_name} />
              )}
            </dl>
          </aside>
        </div>
      </div>

      <Lightbox open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- recorrido */

/** Los 8 pasos en una línea, con la fecha debajo de cada paso ya recorrido. */
function Track({ detalle }: { detalle: PostAuctionCaseDetail }) {
  const reduceMotion = useReducedMotion();
  const index = STATUS_ORDER.indexOf(detalle.status);
  const last = STATUS_ORDER.length - 1;
  const currentTone =
    detalle.status === 'pago_pendiente'
      ? 'border-warning-500 bg-warning-500 ring-warning-100'
      : 'border-brand-600 bg-brand-600 ring-brand-100';

  return (
    <div>
      <div className="relative">
        <div className="absolute left-[6.25%] right-[6.25%] top-[9px] h-0.5 rounded-full bg-line" aria-hidden="true" />
        <motion.div
          key={detalle.status}
          aria-hidden="true"
          className="absolute left-[6.25%] top-[9px] h-0.5 origin-left rounded-full bg-ink"
          style={{ width: '87.5%' }}
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: index / last }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
        <ol aria-label="Progreso de la compra" className="relative grid grid-cols-8">
          {STATUS_ORDER.map((step, i) => {
            const date = stepDate(detalle, step);
            return (
              <li key={step} className="flex flex-col items-center gap-2.5">
                <span
                  aria-current={i === index ? 'step' : undefined}
                  className={`h-5 w-5 rounded-full border-2 ${
                    i < index ? 'border-ink bg-ink' : i === index ? `ring-4 ${currentTone}` : 'border-line-strong bg-white'
                  }`}
                />
                <span className="flex flex-col items-center gap-0.5">
                  <span
                    className={`hidden text-center text-xs leading-tight lg:block ${
                      i === index ? 'font-semibold text-ink' : i < index ? 'text-ink' : 'text-ink-faint'
                    }`}
                  >
                    {STATUS_LABELS[step]}
                  </span>
                  {date && i <= index && (
                    <span className="hidden text-[11px] tabular-nums text-ink-muted lg:block">{formatShortDate(date)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-4 text-sm text-ink-muted lg:hidden">
        Paso {index + 1} de {STATUS_ORDER.length}: {STATUS_LABELS[detalle.status]}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- historial */

/** Historial agrupado por día, el más reciente primero: el día a la izquierda, lo que
 * pasó a la derecha. */
function History({ entries }: { entries: TimelineEntry[] }) {
  const groups: { day: Date; items: TimelineEntry[] }[] = [];
  for (const entry of [...entries].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())) {
    const day = new Date(entry.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.day.toDateString() === day.toDateString()) last.items.push(entry);
    else groups.push({ day, items: [entry] });
  }

  if (groups.length === 0) {
    return <p className="text-ink-muted">Todavía no hay eventos en este caso.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map(({ day, items }) => (
        <div key={day.toDateString()} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-5 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-x-8">
          <div className="pt-4">
            <p className="text-4xl font-semibold leading-none tabular-nums tracking-tight sm:text-5xl">{day.getDate()}</p>
            <p className="mt-1.5 text-sm text-ink-muted">{monthFormatter.format(day).replace('.', '')}</p>
          </div>
          <ul className="border-t border-ink">
            {items.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-4">
                <div className="min-w-0">
                  <p className="font-medium">{describeTimelineAction(entry.action)}</p>
                  <p className="text-sm text-ink-muted">
                    {entry.actor_name ?? 'Sistema'}
                    {entry.previous_status && entry.new_status && (
                      <>
                        , de {STATUS_LABELS[entry.previous_status]} a{' '}
                        <span className={statusTone(entry.new_status as PostAuctionStatus)}>{STATUS_LABELS[entry.new_status]}</span>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-ink-muted">{hourFormatter.format(new Date(entry.occurred_at))} h</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ galería */

function Lightbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const count = DETALLE_IMAGES.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, count]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Fotos del lote"
          className="fixed inset-0 z-50 flex flex-col bg-ink/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center justify-between p-5 text-white">
            <p className="text-sm tabular-nums text-white/70">
              {index + 1} de {count}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar fotos"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-8 sm:px-20">
            <img
              src={DETALLE_IMAGES[index].url}
              alt=""
              style={{ objectPosition: DETALLE_IMAGES[index].position }}
              className="max-h-full w-full max-w-5xl rounded-xl object-cover"
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => setIndex((i) => (i - 1 + count) % count)}
                  className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:left-8"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Foto siguiente"
                  onClick={() => setIndex((i) => (i + 1) % count)}
                  className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:right-8"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
