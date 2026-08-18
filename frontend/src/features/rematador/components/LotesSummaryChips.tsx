import { useMemo } from 'react';
import { ImageIcon, ImageOff, Layers } from 'lucide-react';
import type { Lote } from '../../remates/types';

export interface LotesSummaryChipsProps {
  lotes: Lote[];
}

/**
 * Fila de chips chicos sobre el listado de lotes (rediseño a "centro de preparación del
 * remate") -- pedido explícito: indicadores rápidos, no tarjetas grandes. Derivado
 * client-side de los mismos `lotes` ya cargados (`useLotes`), sin ningún campo nuevo:
 * "con imagen" / "sin imagen" salen de `lote.images.length`, no de un estado de
 * "preparación" que el backend no modela.
 */
export function LotesSummaryChips({ lotes }: LotesSummaryChipsProps) {
  const { total, withImages, withoutImages } = useMemo(() => {
    const withImages = lotes.filter((lote) => lote.images.length > 0).length;
    return { total: lotes.length, withImages, withoutImages: lotes.length - withImages };
  }, [lotes]);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium text-ink-muted">
        <Layers aria-hidden="true" className="h-3.5 w-3.5" />
        {total} {total === 1 ? 'lote' : 'lotes'}
      </span>
      {withImages > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
          <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {withImages} con imagen
        </span>
      )}
      {withoutImages > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700">
          <ImageOff aria-hidden="true" className="h-3.5 w-3.5" />
          {withoutImages} sin imagen
        </span>
      )}
    </div>
  );
}
