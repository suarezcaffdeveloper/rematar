import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Info } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { formatDateTime } from '../../../shared/lib/format';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../labels';
import type { Remate } from '../types';
import { CalendarIcon, PinIcon } from './icons';
import { CoverPlaceholder } from './CoverPlaceholder';

export interface RemateDetailOverviewProps {
  remate: Remate;
  onEnterRoom: () => void;
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="text-sm font-medium text-slate-700">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Encabezado del "Detalle del Remate" -- portada a todo el ancho con degradado y
 * título/estado/CTA superpuestos (rediseño inspirado en el mockup de Stitch,
 * `frontend/stitch_live_auctioneer_dashboard (1)/`), reemplazando el bloque de título
 * plano que antes iba debajo de la imagen. Debajo, la card de descripción (más ancha) y
 * la de detalles (más angosta) van una al lado de la otra con la misma altura
 * (`lg:items-stretch`) -- mismo orden que el mockup (descripción primero, detalles
 * después), invertido respecto de la versión anterior de este componente.
 */
export function RemateDetailOverview({ remate, onEnterRoom }: RemateDetailOverviewProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-[4/3] w-full sm:aspect-[21/9]">
          {remate.cover_image_url ? (
            <img src={remate.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder className="absolute inset-0 h-full w-full" />
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
                <Button
                  onClick={onEnterRoom}
                  className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-slate-900/30 hover:from-brand-700 hover:to-brand-800 hover:shadow-xl"
                >
                  Entrar al remate
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_35%] lg:items-stretch">
        <Card className="flex h-full flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Info aria-hidden="true" className="h-4 w-4 text-brand-600" />
            Descripción
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
          </p>
        </Card>

        <Card className="flex h-full flex-col gap-5">
          <h2 className="text-base font-semibold text-slate-900">Detalles</h2>

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
        </Card>
      </div>
    </div>
  );
}
