import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { useLote } from '../../remates/hooks';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { LoteCardCarousel } from '../../remates/components/LoteCardCarousel';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { PostAuctionCaseDetail } from '../types';

export interface LoteInfoCardProps {
  data: PostAuctionCaseDetail;
}

const OVERLAY_TRANSITION = { duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] as const };

/** Overlay animado con el detalle visual del lote (imágenes, título, descripción) --
 * misma mecánica que `LoteDetailOverlay` en `features/remates/components/LoteCard.tsx`
 * (fade + scale, `useFocusTrap`, Escape, click afuera, scroll bloqueado). Copiado en vez
 * de compartido a propósito, mismo criterio que ese componente y que
 * `LogoutConfirmDialog`: vive local a quien lo usa para no tocar el `Modal` genérico. */
function LoteInfoOverlay({
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
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-xl focus:outline-none"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm ring-1 ring-slate-200 backdrop-blur transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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

/** "Información del lote" (sección 9) -- resumen sin repetir todo lo que ya muestra el
 * header. El botón ya no navega a la gestión de lotes del remate: abre un overlay propio
 * (`LoteInfoOverlay`) con las imágenes del lote (carrusel), título y descripción -- nada
 * más, pedido explícito para no duplicar precios/estado que ya se ven en otras secciones
 * del panel. El detalle completo (`images`/`description`) no viene en
 * `PostAuctionCaseDetail`, así que se trae bajo demanda con `useLote`, recién cuando el
 * overlay se abre por primera vez. */
export function LoteInfoCard({ data }: LoteInfoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { lote, isLoading, error, reload } = useLote(data.remate_id, data.lote_id, isExpanded);

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Información del lote</h2>
      <div className="flex gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg">
          {data.lote_cover_image_url ? (
            <img src={data.lote_cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder
              className="h-full w-full"
              icon={<BoxIcon className="h-6 w-6 text-brand-300" />}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className="truncate text-sm font-medium text-slate-900">{data.lote_title}</p>
          <p className="text-xs text-slate-500">Lote {data.lot_number}</p>
          <p className="truncate text-xs text-slate-500">{data.remate_title}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <Button variant="secondary" className="w-full" onClick={() => setIsExpanded(true)}>
          Ver lote
        </Button>
      </div>

      <LoteInfoOverlay isOpen={isExpanded} onClose={() => setIsExpanded(false)} title={data.lote_title}>
        <div className="flex flex-col gap-4">
          {isLoading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-slate-500">No se pudo cargar el detalle del lote.</p>
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            </div>
          )}

          {!isLoading && !error && lote && (
            <>
              {lote.images.length > 0 ? (
                <LoteCardCarousel images={lote.images} alt={lote.title} />
              ) : (
                <CoverPlaceholder
                  className="aspect-video w-full rounded-xl"
                  icon={<BoxIcon className="h-8 w-8 text-brand-300" />}
                />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900">{lote.title}</h3>
                <Badge>{CATEGORY_LABELS[lote.category]}</Badge>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {lote.description ?? 'Sin descripción.'}
              </p>
            </>
          )}
        </div>
      </LoteInfoOverlay>
    </Card>
  );
}
