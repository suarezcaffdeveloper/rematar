import { Download, FileSpreadsheet, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatDateTime } from '../../../shared/lib/format';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import { CalendarIcon, PinIcon } from '../../remates/components/icons';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import type { Remate } from '../../remates/types';

export interface RemateHistoryHeaderProps {
  remate: Remate;
  /** `undefined` = todavía no hay datos suficientes para armar el archivo (lotes en
   * carga o con error) -- los botones quedan deshabilitados hasta que estén listos. */
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  isExportDisabled?: boolean;
}

interface ExportAction {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled: boolean;
  disabledReason: string;
}

/**
 * Portada del informe ejecutivo (`/remates/:id/historial`) -- mismo lenguaje visual que
 * `RemateDetailOverview` (`features/remates/components/`: degradado + título/estado
 * superpuestos), pero un componente propio de `history`: ese otro sigue siendo exclusivo
 * de la ficha pública `/remates/:id`, no se toca acá.
 *
 * "Compartir" sigue siendo un placeholder deshabilitado a propósito -- pedido explícito,
 * todavía no hay infraestructura de compartir en el proyecto. PDF/Excel sí generan un
 * archivo real (`../export.ts`), disparado por los callbacks que recibe este componente
 * (el armado de los datos vive en `RemateHistoryDetailPage.tsx`, que es quien los tiene
 * todos cargados).
 *
 * En pantallas angostas el texto de cada acción se oculta y solo queda el ícono
 * (`aria-label`/`title` cubren la accesibilidad) -- 3 botones con texto completo
 * amontonados sobre la imagen de portada era lo que producía el recorte/superposición
 * visual que este rediseño corrige.
 */
export function RemateHistoryHeader({
  remate,
  onExportPdf,
  onExportExcel,
  isExportDisabled = false,
}: RemateHistoryHeaderProps) {
  const resolvedAt = remate.finished_at ?? remate.cancelled_at ?? remate.starts_at;

  const actions: ExportAction[] = [
    {
      label: 'Exportar PDF',
      icon: Download,
      onClick: onExportPdf,
      disabled: isExportDisabled,
      disabledReason: 'Todavía se están cargando los datos del remate',
    },
    {
      label: 'Exportar Excel',
      icon: FileSpreadsheet,
      onClick: onExportExcel,
      disabled: isExportDisabled,
      disabledReason: 'Todavía se están cargando los datos del remate',
    },
    { label: 'Compartir', icon: Share2, disabled: true, disabledReason: 'Próximamente' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] w-full sm:aspect-[21/9]">
        {remate.cover_image_url ? (
          <img src={remate.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex justify-end gap-2 p-4 sm:p-6">
          {actions.map(({ label, icon: Icon, onClick, disabled, disabledReason }) => (
            <Button
              key={label}
              variant="secondary"
              disabled={disabled}
              onClick={onClick}
              title={disabled ? disabledReason : label}
              aria-label={label}
              className="h-9 shrink-0 border-none bg-white/90 px-2.5 text-xs shadow-sm backdrop-blur-sm sm:px-3"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-200">
              {CATEGORY_LABELS[remate.category]}
            </span>
            <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{remate.title}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-200">
            {resolvedAt && (
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                {formatDateTime(resolvedAt)}
              </span>
            )}
            {remate.location && (
              <span className="flex items-center gap-1.5">
                <PinIcon className="h-4 w-4" />
                {remate.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
