import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ExpandableDescription } from './ExpandableDescription';

/**
 * Qué es el lote que está en el martillo: número y rubro, título y descripción.
 *
 * Ficha técnica (`lote.attributes`/`quantity`/`unit_label`) sigue sin mostrarse en la Sala
 * (decisión de contenido confirmada, no solo visual).
 *
 * El título se lee entero (baja de renglón si es largo). La descripción arranca recortada
 * a tres renglones y, SOLO si de verdad no entra, aparece "Ver más" para desplegarla: el
 * recorte se mide (no se adivina por cantidad de caracteres) y vuelve a medirse si cambia
 * el ancho de la columna. Al desplegar se respetan los saltos de párrafo de la empresa.
 */
export function LoteIdentity({ lote }: { lote: Lote }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
          En remate ahora
        </span>
        Lote {lote.lot_number}, {CATEGORY_LABELS[lote.category]}
      </p>
      <h2 className="mt-1.5 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink">{lote.title}</h2>
      <ExpandableDescription text={lote.description} resetKey={lote.id} className="mt-2" />
    </div>
  );
}
