import { type ReactNode, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Info } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatDateTime } from '../../../shared/lib/format';
import { pickLoteCoverImages } from '../collage';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../labels';
import type { Lote, Remate } from '../types';
import { CalendarIcon, PinIcon } from './icons';
import { LotesCollagePlaceholder } from './LotesCollagePlaceholder';
import { RemateNotLiveDialog } from './RemateNotLiveDialog';

export interface RemateDetailOverviewProps {
  remate: Remate;
  /** Para armar el collage de portada cuando el remate no tiene `cover_image_url`
   * propio (`LotesCollagePlaceholder`) -- ya cargados por `RemateDetailPage`
   * (`useLotes`), sin request nueva acá. `[]` por defecto: cae al degradé genérico. */
  lotes?: Lote[];
  onEnterRoom: () => void;
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
        <dd className="text-sm font-medium text-ink">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Encabezado del "Detalle del Remate" -- portada a todo el ancho con degradado y
 * título/estado/CTA superpuestos, mismo lenguaje visual que `RemateHistoryHeader`
 * (`features/history/components/`, que copió esta estructura para el informe ejecutivo).
 * Debajo, "Descripción" y "Detalles" van uno al lado del otro sin caja propia --
 * separados por un hairline (`divide-x`/`divide-y`, mismo mecanismo que
 * `RematadorDashboardStats`) en vez de dos `Card` con fondo/borde/sombra, para una
 * lectura más suelta ("en el aire") acorde al resto del rediseño (Épica 9).
 */
export function RemateDetailOverview({ remate, lotes = [], onEnterRoom }: RemateDetailOverviewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isNotLiveDialogOpen, setIsNotLiveDialogOpen] = useState(false);

  // `paused` entra igual que `live`: la Sala ya sabe mostrar ese estado (mismo criterio
  // que `SalaHeader`), no hace falta interceptarlo acá. `finished`/`cancelled` tampoco
  // se interceptan -- son remates que ya pasaron, no "todavía no en vivo", y la Sala ya
  // tiene su propio manejo para ese caso (ver `SalaPage`).
  const isNotYetLive = remate.status === 'draft' || remate.status === 'scheduled';

  function handleEnterClick() {
    if (isNotYetLive) {
      setIsNotLiveDialogOpen(true);
      return;
    }
    onEnterRoom();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="relative aspect-[4/3] w-full sm:aspect-[21/9]">
          {remate.cover_image_url ? (
            <img src={remate.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <LotesCollagePlaceholder
              images={pickLoteCoverImages(lotes)}
              className="absolute inset-0 h-full w-full"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end gap-4 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-200">
                    {CATEGORY_LABELS[remate.category]}
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
                </div>
                <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{remate.title}</h1>
              </div>

              <motion.div
                className="shrink-0"
                whileHover={prefersReducedMotion ? undefined : { scale: 1.02, y: -2 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              >
                <Button variant="primary" onClick={handleEnterClick} className="shadow-lg shadow-slate-900/30">
                  Entrar al remate
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-[1fr_35%] lg:divide-x lg:divide-y-0">
        <div className="flex flex-col gap-3 pb-6 lg:pb-0 lg:pr-8">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Info aria-hidden="true" className="h-4 w-4 text-brand-600" />
            Descripción
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
            {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
          </p>
        </div>

        <div className="flex flex-col gap-4 pt-6 lg:pt-0 lg:pl-8">
          <h2 className="text-base font-semibold text-ink">Detalles</h2>

          <dl className="flex flex-col gap-4">
            {remate.starts_at && (
              <DetailRow icon={<CalendarIcon className="h-4 w-4" />} label="Fecha y hora de inicio">
                {formatDateTime(remate.starts_at)}
              </DetailRow>
            )}
            {remate.location && (
              <DetailRow icon={<PinIcon className="h-4 w-4" />} label="Ubicación">
                {remate.location}
              </DetailRow>
            )}
          </dl>
        </div>
      </div>

      <RemateNotLiveDialog
        isOpen={isNotLiveDialogOpen}
        onClose={() => setIsNotLiveDialogOpen(false)}
        startsAt={remate.starts_at}
      />
    </div>
  );
}
