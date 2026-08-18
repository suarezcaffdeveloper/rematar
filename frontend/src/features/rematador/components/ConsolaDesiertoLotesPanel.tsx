import { useState } from 'react';
import { PackageX, RotateCcw } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { Lote } from '../../remates/types';
import { RequeueLoteForm } from './RequeueLoteForm';

function DesiertoLoteCard({ remateId, lote }: { remateId: string; lote: Lote }) {
  const [isRequeuing, setIsRequeuing] = useState(false);
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  if (isRequeuing) {
    return (
      <div className="rounded-lg border border-line bg-white p-3">
        <p className="mb-2 text-sm font-medium text-ink">
          Lote {lote.lot_number} · {lote.title}
        </p>
        <RequeueLoteForm
          remateId={remateId}
          lote={lote}
          onSuccess={() => setIsRequeuing(false)}
          onCancel={() => setIsRequeuing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md">
          {mainImage ? (
            <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-4 w-4 text-brand-300" />} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Lote {lote.lot_number}
            </span>
            <Badge variant="neutral">Desierto</Badge>
          </div>
          <p className="truncate text-sm font-medium text-ink">{lote.title}</p>
        </div>
      </div>
      <Button variant="brand-soft" className="shrink-0 !gap-1.5" onClick={() => setIsRequeuing(true)}>
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Volver a rematar
      </Button>
    </div>
  );
}

export interface ConsolaDesiertoLotesPanelProps {
  remateId: string;
  /** Ya filtrados a `status === 'closed_unsold'` -- mismo criterio que
   * `ConsolaUpcomingLotesPanel.lotes` (filtrado en el caller, acá solo presentación). */
  lotes: Lote[];
}

/**
 * Panel "Lotes desiertos" de la Consola Operativa (Módulo de lotes desiertos) --
 * lista los lotes cerrados sin adjudicación que todavía pueden volver a rematarse.
 * Deliberadamente oculto por completo cuando no hay ninguno (pedido explícito: "no
 * quiero llenar la interfaz de información innecesaria") -- a diferencia de "Próximos
 * lotes", que siempre se muestra aunque esté vacío.
 *
 * Reincorporar un lote acá no depende de que exista el banner post-cierre de
 * `ConsolaControlPanel` (que se puede haber descartado con "Continuar") -- este panel es
 * la vía persistente para decidir más adelante, tal como pide el enunciado.
 */
export function ConsolaDesiertoLotesPanel({ remateId, lotes }: ConsolaDesiertoLotesPanelProps) {
  if (lotes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
        <PackageX aria-hidden="true" className="h-4 w-4 text-ink-faint" />
        Lotes desiertos
      </h2>
      <div className="flex flex-col gap-2">
        {lotes.map((lote) => (
          <DesiertoLoteCard key={lote.id} remateId={remateId} lote={lote} />
        ))}
      </div>
    </div>
  );
}
