import { useState } from 'react';
import { PackageX, RotateCcw } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { normalizeApiError } from '../../../shared/api/errors';
import { formatCurrency } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { requeueLotePresetRequest } from '../../remates/api';
import type { Lote } from '../../remates/types';
import { RequeueLoteForm } from './RequeueLoteForm';

/**
 * Reencolado preautorizado (ADR-048): cuando la empresa dejó cargado un precio/
 * incremento de antemano (`Lote.requeue_preset_*`, ver `LoteFormModal`), "Volver a
 * rematar" se resuelve en un solo click contra `requeue-preset` -- sin abrir el
 * formulario de precio libre, para que el rematador operador (que el backend no deja
 * fijar un precio distinto) pueda usarlo igual que la empresa. La empresa sigue
 * teniendo, debajo, un link secundario a "Usar otro precio" (el formulario libre de
 * siempre, `requeueLoteRequest`) por si quiere reincorporar con condiciones distintas
 * a las precargadas -- el backend rechaza ese camino si quien lo intenta no es el
 * dueño del remate.
 */
function PresetRequeueButton({
  remateId,
  lote,
  currency,
  canUseCustomPrice,
}: {
  remateId: string;
  lote: Lote;
  currency: string;
  canUseCustomPrice: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useCustomForm, setUseCustomForm] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    try {
      await requeueLotePresetRequest(remateId, lote.id);
      useToastStore
        .getState()
        .push('success', `Lote ${lote.lot_number} reincorporado al final de la cola.`);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (useCustomForm) {
    return (
      <div className="w-full">
        <RequeueLoteForm
          remateId={remateId}
          lote={lote}
          onSuccess={() => setUseCustomForm(false)}
          onCancel={() => setUseCustomForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button variant="brand-soft" className="!gap-1.5" onClick={handleClick} isLoading={isSubmitting}>
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Volver a rematar
      </Button>
      {lote.requeue_preset_base_price && (
        <span className="text-xs text-ink-faint">
          Desde {formatCurrency(lote.requeue_preset_base_price, currency)}
        </span>
      )}
      {canUseCustomPrice && (
        <button
          type="button"
          onClick={() => setUseCustomForm(true)}
          className="text-xs text-ink-faint underline decoration-dotted hover:text-ink-muted"
        >
          Usar otro precio
        </button>
      )}
    </div>
  );
}

function DesiertoLoteCard({
  remateId,
  lote,
  currency,
  canUseCustomPrice,
}: {
  remateId: string;
  lote: Lote;
  currency: string;
  canUseCustomPrice: boolean;
}) {
  const [isRequeuing, setIsRequeuing] = useState(false);
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  if (!lote.requeue_preset_enabled && isRequeuing) {
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
      {lote.requeue_preset_enabled ? (
        <PresetRequeueButton
          remateId={remateId}
          lote={lote}
          currency={currency}
          canUseCustomPrice={canUseCustomPrice}
        />
      ) : canUseCustomPrice ? (
        <Button variant="brand-soft" className="shrink-0 !gap-1.5" onClick={() => setIsRequeuing(true)}>
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Volver a rematar
        </Button>
      ) : (
        <span className="shrink-0 text-right text-xs text-ink-faint">
          Necesita que la empresa defina un precio para reincorporarlo.
        </span>
      )}
    </div>
  );
}

export interface ConsolaDesiertoLotesPanelProps {
  remateId: string;
  /** Ya filtrados a `status === 'closed_unsold'` -- mismo criterio que
   * `ConsolaUpcomingLotesPanel.lotes` (filtrado en el caller, acá solo presentación). */
  lotes: Lote[];
  currency: string;
  /** `true` solo para la empresa dueña: el reencolado con precio libre
   * (`requeueLoteRequest`) es owner-only en el backend (`LoteService.requeue`), a
   * diferencia del preautorizado (`requeue_preset`), que sí puede usar el rematador
   * operador. Sin este flag, el rematador veía el mismo botón "Volver a rematar" que la
   * empresa para un lote sin preset, pero el submit le fallaba con 403 -- acá en vez de
   * eso ve un aviso de que hace falta que la empresa defina un precio. */
  canUseCustomPrice: boolean;
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
export function ConsolaDesiertoLotesPanel({ remateId, lotes, currency, canUseCustomPrice }: ConsolaDesiertoLotesPanelProps) {
  if (lotes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
        <PackageX aria-hidden="true" className="h-4 w-4 text-ink-faint" />
        Lotes desiertos
      </h2>
      <div className="flex flex-col gap-2">
        {lotes.map((lote) => (
          <DesiertoLoteCard
            key={lote.id}
            remateId={remateId}
            lote={lote}
            currency={currency}
            canUseCustomPrice={canUseCustomPrice}
          />
        ))}
      </div>
    </div>
  );
}
