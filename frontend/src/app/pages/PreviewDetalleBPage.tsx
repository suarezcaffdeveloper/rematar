import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getStatusCopy } from '../../features/postauction/buyerStatusCopy';
import { STATUS_LABELS, STATUS_ORDER } from '../../features/postauction/labels';
import type { TimelineEntry } from '../../features/postauction/types';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import { formatShortDate, money, statusTone } from './previewCompras/shared';
import { buildDetalle, DETALLE_IMAGES, groupTimelineByStep, parseEstado, stepDate } from './previewCompraDetalle/mock';

const hourFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Vista previa B del detalle de una compra: "recorrido". En vez de separar el progreso, lo
 * que sigue y el historial en tres bloques que cuentan la misma historia, la página es un
 * único recorrido vertical: cada uno de los 8 pasos muestra cuándo se cumplió y qué pasó
 * ahí (quién lo registró, qué observaciones dejó el martillero); el paso actual se abre con
 * "qué sigue" y los que faltan quedan atenuados. A la izquierda, una columna fija con las
 * fotos, el precio y los datos de la compra. Datos de prueba, sin backend:
 * `?estado=pago_pendiente` (o cualquiera de los 8) cambia el estado.
 */
export function PreviewDetalleBPage() {
  const reduceMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const status = parseEstado(searchParams.get('estado'));
  const detalle = useMemo(() => buildDetalle(status), [status]);
  const copy = getStatusCopy(detalle);
  const byStep = useMemo(() => groupTimelineByStep(detalle.timeline), [detalle]);
  const index = STATUS_ORDER.indexOf(status);
  const needsPayment = status === 'pago_pendiente';
  const [photo, setPhoto] = useState(0);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="compras" />
      <div className="mx-auto w-full max-w-[110rem] px-3 py-6 sm:px-6 lg:px-10">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="group mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Mis compras
        </a>

        <div className="grid gap-12 pb-20 lg:grid-cols-[23rem_minmax(0,1fr)] lg:gap-20">
          <aside aria-label="Datos de la compra" className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-2xl bg-surface-subtle">
              <img
                key={photo}
                src={DETALLE_IMAGES[photo].url}
                alt={detalle.lote_title}
                style={{ objectPosition: DETALLE_IMAGES[photo].position }}
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="mt-3 flex gap-2" role="group" aria-label="Fotos del lote">
              {DETALLE_IMAGES.map((image, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={`Ver foto ${i + 1}`}
                  aria-pressed={photo === i}
                  className={`h-14 w-20 overflow-hidden rounded-lg ring-offset-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    photo === i ? 'ring-2 ring-ink' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={image.url} alt="" style={{ objectPosition: image.position }} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>

            <h1 className="mt-7 text-balance text-2xl font-semibold leading-tight tracking-tight">{detalle.lote_title}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Lote {detalle.lot_number} del remate {detalle.remate_title}
            </p>

            <p className="mt-6 text-4xl font-semibold tabular-nums tracking-tight">{money(detalle.final_price)}</p>
            <p className="mt-1 text-sm text-ink-muted">precio final, base {money(detalle.base_price)}</p>

            <dl className="mt-6 border-t border-ink">
              <Fact label="Adjudicado el" value={formatShortDate(detalle.created_at)} />
              <Fact label="Martillero" value={detalle.operador_name ?? detalle.rematador_name ?? '-'} />
              {detalle.empresa_name && detalle.empresa_name !== detalle.operador_name && (
                <Fact label="Empresa" value={detalle.empresa_name} />
              )}
            </dl>
          </aside>

          <main className="min-w-0">
            <p className={`flex items-center gap-2.5 text-sm font-medium ${statusTone(status)}`}>
              <span className="relative inline-flex h-2 w-2" aria-hidden="true">
                {needsPayment && <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-75" />}
                <span className={`relative h-2 w-2 rounded-full ${needsPayment ? 'bg-warning-500' : 'bg-brand-500'}`} />
              </span>
              {STATUS_LABELS[status]}
            </p>
            <h2 className="mt-2 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              {copy.headline}
            </h2>

            <ol aria-label="Recorrido de la compra" className="mt-14">
              {STATUS_ORDER.map((step, i) => {
                const done = i < index;
                const current = i === index;
                const date = stepDate(detalle, step);
                const isLast = i === STATUS_ORDER.length - 1;
                return (
                  <motion.li
                    key={step}
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.06 * i }}
                    aria-current={current ? 'step' : undefined}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-5"
                  >
                    <div className="flex flex-col items-center">
                      <span className="relative mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center">
                        {current && needsPayment && (
                          <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-50" />
                        )}
                        <span
                          className={`relative h-5 w-5 rounded-full border-2 ${
                            done
                              ? 'border-ink bg-ink'
                              : current
                                ? needsPayment
                                  ? 'border-warning-500 bg-warning-500 ring-4 ring-warning-100'
                                  : 'border-brand-600 bg-brand-600 ring-4 ring-brand-100'
                                : 'border-line-strong bg-white'
                          }`}
                        />
                      </span>
                      {!isLast && <span className={`my-1 w-0.5 flex-1 rounded-full ${done ? 'bg-ink' : 'bg-line'}`} />}
                    </div>

                    <div className={`min-w-0 ${isLast ? '' : 'pb-10'}`}>
                      <div className="flex items-baseline justify-between gap-4">
                        <h3
                          className={
                            current
                              ? 'text-2xl font-semibold tracking-tight'
                              : done
                                ? 'text-xl font-medium tracking-tight'
                                : 'text-xl tracking-tight text-ink-faint'
                          }
                        >
                          {STATUS_LABELS[step]}
                        </h3>
                        <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                          {date && i <= index ? formatShortDate(date) : i > index ? 'Pendiente' : ''}
                        </span>
                      </div>

                      {current && (
                        <div
                          className={`mt-4 rounded-2xl p-6 ${needsPayment ? 'bg-warning-50' : 'bg-brand-50/70'}`}
                        >
                          {copy.nextStepTitle !== STATUS_LABELS[step] && (
                            <p className="text-lg font-semibold tracking-tight">{copy.nextStepTitle}</p>
                          )}
                          <p className="max-w-2xl leading-relaxed text-ink-muted">
                            {needsPayment && <strong className="font-semibold text-ink">Te toca a vos. </strong>}
                            {copy.nextStepDescription}
                          </p>
                        </div>
                      )}

                      {i <= index && <StepEntries entries={byStep[step]} />}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </main>
        </div>
      </div>
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

/** Lo que quedó registrado en un paso: quién lo registró y las observaciones del martillero
 * (en sus propias palabras). Las notificaciones fallidas son una señal interna que el
 * comprador no puede accionar, así que no se muestran (igual que hoy). */
function StepEntries({ entries }: { entries: TimelineEntry[] }) {
  const visible = entries.filter((e) => e.action !== 'notification_failed');
  const registered = visible.find((e) => e.action === 'status_changed' || e.action === 'case_created');
  const notes = visible.filter((e) => e.action === 'note_added');
  if (!registered && notes.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-3">
      {registered && (
        <p className="text-sm text-ink-muted">
          {registered.actor_name ? `Lo registró ${registered.actor_name}` : 'Registrado automáticamente'}, a las{' '}
          {hourFormatter.format(new Date(registered.occurred_at))} h
        </p>
      )}
      {notes.map((note) => (
        <figure key={note.id} className="border-l-2 border-ink pl-4">
          <blockquote className="max-w-2xl text-lg leading-snug tracking-tight">{note.note}</blockquote>
          <figcaption className="mt-1.5 text-sm text-ink-muted">
            {note.actor_name ?? 'Martillero'}, {formatShortDate(note.occurred_at)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
