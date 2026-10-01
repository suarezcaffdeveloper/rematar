import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatTime } from '../../../../shared/lib/format';
import { getStatusCopy } from '../../buyerStatusCopy';
import { formatShortDate } from '../../comprasUtils';
import { groupTimelineByStep, stepDate } from '../../detalleUtils';
import { describeTimelineAction, STATUS_LABELS, STATUS_ORDER } from '../../labels';
import type { PostAuctionCaseDetail, TimelineEntry } from '../../types';
import { statusTone } from '../compras/statusTone';

/**
 * El recorrido de la compra: un único hilo vertical de 8 pasos en lugar de tres bloques
 * separados (progreso, "qué sigue", historial) que contaban la misma historia. Cada paso
 * cumplido muestra cuándo pasó y qué quedó registrado ahí (quién lo registró, las
 * observaciones del martillero); el paso actual se abre con "qué sigue" -- en ámbar y con
 * "Te toca a vos" si espera el pago del comprador -- y los que faltan quedan atenuados.
 */
export function DetalleJourney({ detail }: { detail: PostAuctionCaseDetail }) {
  const reduceMotion = useReducedMotion();
  const copy = getStatusCopy(detail);
  const byStep = useMemo(() => groupTimelineByStep(detail.timeline), [detail.timeline]);
  const index = STATUS_ORDER.indexOf(detail.status);
  const needsPayment = detail.status === 'pago_pendiente';

  return (
    <div className="min-w-0">
      <p className={`flex items-center gap-2.5 text-sm font-medium ${statusTone(detail.status)}`}>
        <span className="relative inline-flex h-2 w-2" aria-hidden="true">
          {needsPayment && <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-75" />}
          <span className={`relative h-2 w-2 rounded-full ${needsPayment ? 'bg-warning-500' : 'bg-brand-500'}`} />
        </span>
        {STATUS_LABELS[detail.status]}
      </p>
      <h2 className="mt-2 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        {copy.headline}
      </h2>

      <ol aria-label="Recorrido de la compra" className="mt-14">
        {STATUS_ORDER.map((step, i) => {
          const done = i < index;
          const current = i === index;
          const date = stepDate(detail, step);
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
                    {i > index ? 'Pendiente' : date ? formatShortDate(date) : ''}
                  </span>
                </div>

                {current && (
                  <div className={`mt-4 rounded-2xl p-6 ${needsPayment ? 'bg-warning-50' : 'bg-brand-50/70'}`}>
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
    </div>
  );
}

/** Lo que quedó registrado en un paso: quién lo registró, las observaciones del martillero
 * (en sus propias palabras) y cualquier otra acción del caso (documentos, notificaciones). */
function StepEntries({ entries }: { entries: TimelineEntry[] }) {
  const registered = entries.find((e) => e.action === 'status_changed' || e.action === 'case_created');
  const notes = entries.filter((e) => e.action === 'note_added');
  const others = entries.filter((e) => e !== registered && e.action !== 'note_added');
  if (!registered && notes.length === 0 && others.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-3">
      {registered && (
        <p className="text-sm text-ink-muted">
          {registered.actor_name ? `Lo registró ${registered.actor_name}` : 'Registrado automáticamente'}, a las{' '}
          {formatTime(registered.occurred_at)}
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
      {others.map((other) => (
        <p key={other.id} className="text-sm text-ink-muted">
          {describeTimelineAction(other.action)}, {formatShortDate(other.occurred_at)}
          {other.note ? `: ${other.note}` : ''}
        </p>
      ))}
    </div>
  );
}
