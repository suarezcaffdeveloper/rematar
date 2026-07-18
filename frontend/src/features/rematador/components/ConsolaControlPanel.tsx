import { useState } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  closeLoteRequest,
  finishRemateRequest,
  openLoteRequest,
  openNextLoteRequest,
  pauseRemateRequest,
  resumeRemateRequest,
} from '../../remates/api';
import type { Lote, Remate } from '../../remates/types';

export interface ConsolaControlPanelProps {
  remate: Remate;
  activeLote: Lote | null;
  selectedLoteId: string | null;
  hasUpcomingLotes: boolean;
}

type PendingAction = 'pause' | 'resume' | 'finish' | 'openSelected' | 'openNext' | 'close' | null;

/**
 * Panel de control de la Consola Operativa (Épica 5, Módulo 5.2): las seis acciones
 * pedidas por el enunciado (abrir lote, pausar, reanudar, cerrar lote, pasar al
 * siguiente lote, finalizar), todas consumiendo endpoints ya existentes del motor de
 * estados (`docs/16-motor-de-estados.md`). Los seis botones están siempre visibles
 * (mismo criterio de "centro de control" pedido en el diseño) -- se habilitan/
 * deshabilitan según el estado actual, validando en el cliente las mismas precondiciones
 * que el backend ya exige (para no dejar pasar una acción que va a volver con un 422).
 *
 * "Cerrar lote" es la única acción con un paso intermedio: un formulario en línea
 * (resultado + precio final si se vendió) que sirve, a la vez, de confirmación explícita
 * -- no hace falta un `window.confirm` además de eso. "Finalizar remate" sí usa
 * `window.confirm`: es una acción de un solo clic que termina el remate, sin ningún otro
 * paso intermedio.
 *
 * Deliberadamente sin ningún `reload()`/refresco manual tras una acción exitosa: la
 * propia consola ya está unida a la sala por WebSocket (`useLiveRemateState`, Épica 4.6),
 * así que el evento que la acción dispara (`lote.opened`, `remate.paused`, etc.) vuelve
 * por el mismo canal y actualiza todo, normalmente antes incluso de que esta misma
 * llamada HTTP termine de resolver. Se probó agregar un refresco HTTP de respaldo
 * (`reload()` de `useRemateSnapshot`) "por las dudas" y **empeoró las cosas**: el
 * Snapshot Service cachea la respuesta cruda en Redis por `SNAPSHOT_CACHE_TTL_SECONDS`
 * (2s, ver `docs/23-snapshot-service.md`) -- un `reload()` disparado justo después de
 * abrir un lote podía traer de vuelta la respuesta cacheada de *antes* de la acción,
 * pisando el estado correcto que el evento de WebSocket ya había aplicado. Ver
 * ADR-033 para el detalle completo.
 */
export function ConsolaControlPanel({ remate, activeLote, selectedLoteId, hasUpcomingLotes }: ConsolaControlPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isClosingLote, setIsClosingLote] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<'sold' | 'unsold'>('sold');
  const [finalPrice, setFinalPrice] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const isLive = remate.status === 'live';
  const isPaused = remate.status === 'paused';

  async function runSimpleAction(
    action: Exclude<PendingAction, 'close' | null>,
    request: () => Promise<unknown>,
    successMessage: string,
  ) {
    setPendingAction(action);
    try {
      await request();
      useToastStore.getState().push('success', successMessage);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  function handleFinish() {
    const confirmed = window.confirm(`¿Finalizar "${remate.title}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    void runSimpleAction('finish', () => finishRemateRequest(remate.id), 'El remate se finalizó.');
  }

  function openCloseForm() {
    setCloseOutcome('sold');
    setFinalPrice('');
    setCloseError(null);
    setIsClosingLote(true);
  }

  function cancelCloseForm() {
    setIsClosingLote(false);
    setCloseError(null);
  }

  const basePrice = activeLote ? Number(activeLote.base_price) : 0;
  const parsedFinalPrice = Number(finalPrice);
  const isFinalPriceValid =
    finalPrice.trim() !== '' && Number.isFinite(parsedFinalPrice) && parsedFinalPrice >= basePrice;

  async function submitClose() {
    // "Confirmar cierre" ya queda deshabilitado mientras `outcome === 'sold'` y el
    // precio no es válido (ver el botón más abajo) -- acá no hace falta repetir esa
    // validación, este handler nunca se dispara en ese estado.
    if (!activeLote) return;

    setPendingAction('close');
    setCloseError(null);
    try {
      await closeLoteRequest(remate.id, activeLote.id, {
        outcome: closeOutcome,
        final_price: closeOutcome === 'sold' ? finalPrice : undefined,
      });
      useToastStore.getState().push('success', 'El lote se cerró.');
      setIsClosingLote(false);
    } catch (err) {
      setCloseError(normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  if (isClosingLote && activeLote) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cerrar lote {activeLote.lot_number}
        </h2>

        <div className="flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="close-outcome"
              checked={closeOutcome === 'sold'}
              onChange={() => {
                setCloseOutcome('sold');
                setCloseError(null);
              }}
            />
            Vendido
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="close-outcome"
              checked={closeOutcome === 'unsold'}
              onChange={() => {
                setCloseOutcome('unsold');
                setCloseError(null);
              }}
            />
            Desierto
          </label>
        </div>

        {closeOutcome === 'sold' && (
          <Input
            label="Precio final"
            type="number"
            min={activeLote.base_price}
            step="0.01"
            value={finalPrice}
            onChange={(event) => setFinalPrice(event.target.value)}
            error={closeError ?? undefined}
          />
        )}
        {closeOutcome === 'unsold' && closeError && <p className="text-sm text-danger-600">{closeError}</p>}

        <div className="flex gap-2">
          <Button
            onClick={submitClose}
            isLoading={pendingAction === 'close'}
            disabled={closeOutcome === 'sold' && !isFinalPriceValid}
          >
            Confirmar cierre
          </Button>
          <Button variant="ghost" onClick={cancelCloseForm} disabled={pendingAction === 'close'}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Panel de control</h2>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            selectedLoteId &&
            runSimpleAction('openSelected', () => openLoteRequest(remate.id, selectedLoteId), 'Lote abierto.')
          }
          isLoading={pendingAction === 'openSelected'}
          disabled={!isLive || Boolean(activeLote) || !selectedLoteId || pendingAction !== null}
          title={!selectedLoteId ? 'Seleccioná un lote en "Próximos lotes" primero.' : undefined}
        >
          Abrir lote
        </Button>

        <Button
          variant="secondary"
          onClick={() => runSimpleAction('openNext', () => openNextLoteRequest(remate.id), 'Lote abierto.')}
          isLoading={pendingAction === 'openNext'}
          disabled={!isLive || Boolean(activeLote) || !hasUpcomingLotes || pendingAction !== null}
        >
          Pasar al siguiente lote
        </Button>

        <Button
          variant="secondary"
          onClick={openCloseForm}
          disabled={!(isLive || isPaused) || !activeLote || pendingAction !== null}
        >
          Cerrar lote
        </Button>

        <Button
          variant="secondary"
          onClick={() => runSimpleAction('pause', () => pauseRemateRequest(remate.id), 'El remate se pausó.')}
          isLoading={pendingAction === 'pause'}
          disabled={!isLive || pendingAction !== null}
        >
          Pausar remate
        </Button>

        <Button
          onClick={() => runSimpleAction('resume', () => resumeRemateRequest(remate.id), 'El remate se reanudó.')}
          isLoading={pendingAction === 'resume'}
          disabled={!isPaused || pendingAction !== null}
        >
          Reanudar remate
        </Button>

        <Button
          variant="danger"
          onClick={handleFinish}
          isLoading={pendingAction === 'finish'}
          disabled={!isLive || Boolean(activeLote) || pendingAction !== null}
          title={activeLote ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
        >
          Finalizar remate
        </Button>
      </div>
    </div>
  );
}
