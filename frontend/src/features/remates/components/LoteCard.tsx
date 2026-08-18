import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ImageIcon, X } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { formatCurrency } from '../../../shared/lib/format';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../labels';
import type { Lote } from '../types';
import { CoverPlaceholder } from './CoverPlaceholder';
import { BoxIcon } from './icons';
import { LoteCardCarousel } from './LoteCardCarousel';

export interface LoteCardProps {
  lote: Lote;
  currency: string;
}

const OVERLAY_TRANSITION = { duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] as const };

function PriceRow({ lote, currency }: { lote: Lote; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-semibold text-ink">{formatCurrency(lote.base_price, currency)}</span>
      <span className="text-ink-faint">Incremento {formatCurrency(lote.min_increment, currency)}</span>
      {lote.reserve_price && <span className="text-ink-faint">Reserva {formatCurrency(lote.reserve_price, currency)}</span>}
    </div>
  );
}

/** Overlay animado propio de `LoteCard` -- misma mecánica de accesibilidad que `Modal`
 * (`useFocusTrap`, Escape, click afuera, bloqueo de scroll) pero con una transición de
 * entrada/salida suave (fade + scale) en vez de aparecer/desaparecer de golpe, pedido
 * explícito de la revisión de diseño ("que ese movimiento se note y sea suave"). No se
 * tocó `Modal` (componente compartido por el resto de la app) para no afectar ningún otro
 * flujo -- esto vive solo acá, específico de la card de lote. */
function LoteDetailOverlay({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_TRANSITION}
            className="absolute inset-0 bg-slate-900/60"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            transition={OVERLAY_TRANSITION}
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl bg-white shadow-xl focus:outline-none"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-faint shadow-sm ring-1 ring-line backdrop-blur transition-colors hover:bg-surface-subtle hover:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Tarjeta de un lote dentro del listado de `RemateDetailPage` -- horizontal en desktop
 * (imagen a la izquierda, datos a la derecha), apilada en mobile. Con al menos una imagen,
 * la card es clickeable: abre `LoteDetailOverlay` con el carrusel de todas las imágenes
 * del lote (`LoteCardCarousel`, con swipe/flechas/teclado), más nombre, descripción
 * completa y precios. La card chica de la grilla no cambia en absoluto -- solo cambia a
 * dónde lleva el click. Muestra precio inicial/incremento/reserva -- `reserve_price` ya
 * viene enmascarado a `null` por el backend para cualquier viewer que no sea el dueño del
 * remate (`LoteService._mask_reserve_price`), así que mostrarlo acá cuando no es nulo es
 * seguro. */
export function LoteCard({ lote, currency }: LoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const sortedImages = [...lote.images].sort((a, b) => a.order - b.order);
  const mainImage = sortedImages[0];
  const canExpand = sortedImages.length > 0;

  function open() {
    if (canExpand) setIsExpanded(true);
  }

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
        transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg"
      >
        <div
          role={canExpand ? 'button' : undefined}
          tabIndex={canExpand ? 0 : undefined}
          aria-haspopup={canExpand ? 'dialog' : undefined}
          onClick={open}
          onKeyDown={(event) => {
            if (!canExpand) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }}
          className={clsx(
            'flex flex-col sm:flex-row',
            canExpand && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
          )}
        >
          <div className="group relative aspect-video w-full shrink-0 overflow-hidden bg-surface-subtle sm:aspect-square sm:w-48">
            {mainImage ? (
              <img
                src={mainImage.url}
                alt={mainImage.caption ?? ''}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-8 w-8 text-brand-300" />} />
            )}
            {sortedImages.length > 1 && (
              <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                <ImageIcon aria-hidden="true" className="h-3 w-3" />
                {sortedImages.length}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
                Lote {lote.lot_number}
              </span>
              <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
            </div>
            <h3 className="text-base font-semibold text-ink">{lote.title}</h3>
            {lote.description && <p className="line-clamp-2 text-sm text-ink-muted">{lote.description}</p>}

            <div className="mt-1">
              <PriceRow lote={lote} currency={currency} />
            </div>
          </div>
        </div>
      </motion.article>

      {canExpand && (
        <LoteDetailOverlay isOpen={isExpanded} onClose={() => setIsExpanded(false)} title={lote.title}>
          <div className="flex flex-col gap-4">
            <LoteCardCarousel images={sortedImages} alt={lote.title} />

            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
                Lote {lote.lot_number}
              </span>
              <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
            </div>
            <h3 className="text-xl font-bold text-ink">{lote.title}</h3>
            {lote.description && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{lote.description}</p>
            )}

            <div className="border-t border-line pt-4">
              <PriceRow lote={lote} currency={currency} />
            </div>
          </div>
        </LoteDetailOverlay>
      )}
    </>
  );
}
