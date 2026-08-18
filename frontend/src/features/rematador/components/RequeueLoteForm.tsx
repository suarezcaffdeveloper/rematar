import { useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { useToastStore } from '../../../shared/toast/toastStore';
import { requeueLoteRequest } from '../../remates/api';
import type { Lote } from '../../remates/types';

export interface RequeueLoteFormProps {
  remateId: string;
  lote: Lote;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Formulario inline de "volver a rematar" un lote desierto (Módulo de lotes
 * desiertos) -- precio inicial e incremento mínimo arrancan precargados con los de la
 * ronda que acaba de cerrarse (pedido explícito: no asumir que tienen que ser iguales,
 * pero tampoco obligar a repetirlos si el rematador no quiere cambiar nada). Sin campo
 * de precio de reserva a propósito (pedido explícito) -- la nueva ronda conserva el que
 * ya tenía el lote, sin poder editarlo desde acá; `requeueLoteRequest` nunca manda esa
 * clave en el body, así que el backend la deja intacta (`LoteService.requeue` solo
 * cambia lo que llega en el `PATCH` parcial). Reusado tanto por el banner que aparece
 * justo después de cerrar un lote como desierto (`ConsolaControlPanel`) como por cada
 * tarjeta del panel "Lotes desiertos" (`ConsolaDesiertoLotesPanel`) -- misma lógica, dos
 * lugares donde el rematador puede decidir reincorporar un lote.
 *
 * No hace `reload()` ni actualiza ningún estado del lote por sí solo tras el éxito: el
 * evento `lote.requeued` ya llega por WebSocket y actualiza la lista de lotes sola
 * (mismo criterio "sin refresco manual" que el resto de la Consola, ver
 * `ConsolaControlPanel`) -- `onSuccess` solo le avisa al que lo embebe que puede
 * cerrar/ocultar este formulario.
 */
export function RequeueLoteForm({ remateId, lote, onSuccess, onCancel }: RequeueLoteFormProps) {
  const [basePrice, setBasePrice] = useState(lote.base_price);
  const [minIncrement, setMinIncrement] = useState(lote.min_increment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedBasePrice = Number(basePrice);
  const isBasePriceValid = basePrice.trim() !== '' && Number.isFinite(parsedBasePrice) && parsedBasePrice > 0;
  const parsedMinIncrement = Number(minIncrement);
  const isMinIncrementValid =
    minIncrement.trim() !== '' && Number.isFinite(parsedMinIncrement) && parsedMinIncrement > 0;

  async function submit() {
    setIsSubmitting(true);
    setError(null);
    try {
      await requeueLoteRequest(remateId, lote.id, {
        base_price: basePrice,
        min_increment: minIncrement,
      });
      useToastStore
        .getState()
        .push('success', `Lote ${lote.lot_number} reincorporado al final de la cola.`);
      onSuccess();
    } catch (err) {
      setError(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-subtle p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Precio inicial"
          type="number"
          min={0}
          step="0.01"
          value={basePrice}
          onChange={(event) => setBasePrice(event.target.value)}
        />
        <Input
          label="Incremento mínimo"
          type="number"
          min={0}
          step="0.01"
          value={minIncrement}
          onChange={(event) => setMinIncrement(event.target.value)}
        />
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          onClick={submit}
          isLoading={isSubmitting}
          disabled={!isBasePriceValid || !isMinIncrementValid}
        >
          Confirmar reincorporación
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
