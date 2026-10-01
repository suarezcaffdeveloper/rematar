import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useFocusTrap } from '../../../../shared/hooks/useFocusTrap';
import { formatCurrency } from '../../../../shared/lib/format';
import { LOTE_STATUS_TONE, sortedImages } from '../../ficha';
import { LOTE_STATUS_LABELS } from '../../labels';
import type { Lote } from '../../types';
import { CoverPlaceholder } from '../CoverPlaceholder';
import { BoxIcon } from '../icons';

export interface LoteViewerProps {
  lote: Lote | null;
  currency: string;
  onClose: () => void;
}

/**
 * Visor de un lote: todas sus fotos a la izquierda (flechas, teclado ← →, contador) y sus
 * datos a la derecha. Mismas garantías de accesibilidad que los demás overlays de la app:
 * foco atrapado (`useFocusTrap`), Escape y click afuera para cerrar, scroll bloqueado
 * mientras está abierto. Las fotos se ven completas (`object-contain` sobre fondo oscuro):
 * las que suben las empresas no vienen todas en la misma proporción y recortarlas cortaba
 * el techo o el piso de las verticales -- mismo criterio que la Sala. `reserve_price` ya
 * viene en `null` para quien no es dueño del remate (el backend lo enmascara), así que
 * mostrarlo cuando existe es seguro.
 */
export function LoteViewer({ lote, currency, onClose }: LoteViewerProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const images = lote ? sortedImages(lote) : [];
  const count = images.length;
  const isOpen = lote !== null;

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    setIndex(0);
  }, [lote?.id]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => (count > 1 ? (i + 1) % count : i));
      if (event.key === 'ArrowLeft') setIndex((i) => (count > 1 ? (i - 1 + count) % count : i));
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose, count]);

  return createPortal(
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
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Lote ${lote.lot_number}: ${lote.title}`}
            className="relative grid max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl focus:outline-none lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative bg-ink">
              {count > 0 ? (
                <img
                  key={index}
                  src={images[index].url}
                  alt={images[index].caption ?? `Foto ${index + 1} de ${count}`}
                  className="aspect-[4/3] w-full object-contain lg:h-full lg:min-h-[30rem]"
                />
              ) : (
                <CoverPlaceholder
                  className="aspect-[4/3] w-full lg:h-full lg:min-h-[30rem]"
                  icon={<BoxIcon className="h-10 w-10 text-brand-300" />}
                />
              )}
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
                <span className={`font-medium ${LOTE_STATUS_TONE[lote.status]}`}>{LOTE_STATUS_LABELS[lote.status]}</span>
              </p>
              <h2 className="-mt-2 text-balance pr-10 text-3xl font-semibold leading-tight tracking-tight">
                {lote.title}
              </h2>
              {lote.description && (
                <p className="whitespace-pre-line leading-relaxed text-ink-muted">{lote.description}</p>
              )}
              <dl className="mt-auto border-t border-ink">
                <Row label="Precio base" value={formatCurrency(lote.base_price, currency)} />
                <Row label="Incremento mínimo" value={formatCurrency(lote.min_increment, currency)} />
                {lote.reserve_price && <Row label="Reserva" value={formatCurrency(lote.reserve_price, currency)} />}
                {lote.status === 'closed_sold' && lote.final_price && (
                  <Row label="Vendido en" value={formatCurrency(lote.final_price, currency)} />
                )}
              </dl>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
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
