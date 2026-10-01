import { motion, useReducedMotion } from 'framer-motion';
import { STATUS_LABELS, STATUS_ORDER } from '../../labels';
import type { PostAuctionStatus } from '../../types';

/**
 * Los 8 pasos del proceso post-remate en una línea: lo hecho en tinta, el paso actual en
 * color (ámbar si espera el pago del comprador) y lo que falta vacío. La línea se llena
 * hasta el paso actual cuando la fila entra en pantalla. Solo lectura de `STATUS_ORDER`,
 * igual que `ProgressStepper` (el detalle de la compra) -- no valida transiciones.
 */
export function ProcessTrack({ status }: { status: PostAuctionStatus }) {
  const reduceMotion = useReducedMotion();
  const index = STATUS_ORDER.indexOf(status);
  const last = STATUS_ORDER.length - 1;
  const currentTone =
    status === 'pago_pendiente'
      ? 'border-warning-500 bg-warning-500 ring-warning-100'
      : 'border-brand-600 bg-brand-600 ring-brand-100';

  return (
    <div>
      <div className="relative">
        <div className="absolute left-[6.25%] right-[6.25%] top-[7px] h-0.5 rounded-full bg-line" aria-hidden="true" />
        <motion.div
          aria-hidden="true"
          className="absolute left-[6.25%] top-[7px] h-0.5 origin-left rounded-full bg-ink"
          style={{ width: '87.5%' }}
          initial={reduceMotion ? false : { scaleX: 0 }}
          whileInView={{ scaleX: index / last }}
          animate={reduceMotion ? { scaleX: index / last } : undefined}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
        <ol aria-label="Progreso de la compra" className="relative grid grid-cols-8">
          {STATUS_ORDER.map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-2">
              <span
                aria-current={i === index ? 'step' : undefined}
                className={`h-4 w-4 rounded-full border-2 ${
                  i < index
                    ? 'border-ink bg-ink'
                    : i === index
                      ? `ring-4 ${currentTone}`
                      : 'border-line-strong bg-white'
                }`}
              />
              <span
                className={`hidden text-center text-[11px] leading-tight lg:block ${
                  i === index ? 'font-semibold text-ink' : 'text-ink-faint'
                }`}
              >
                {STATUS_LABELS[step]}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-sm text-ink-muted lg:hidden">
        Paso {index + 1} de {STATUS_ORDER.length}: {STATUS_LABELS[status]}
      </p>
    </div>
  );
}
