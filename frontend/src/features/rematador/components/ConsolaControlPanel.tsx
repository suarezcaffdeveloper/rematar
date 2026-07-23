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
  pauseLoteTimerRequest,
  pauseRemateRequest,
  resetLoteTimerRequest,
  resumeLoteTimerRequest,
  resumeRemateRequest,
  setLoteTimerAutoCloseRequest,
  setLoteTimerRemainingRequest,
} from '../../remates/api';
import type { Lote, Remate } from '../../remates/types';

export interface ConsolaControlPanelProps {
  remate: Remate;
  activeLote: Lote | null;
  selectedLoteId: string | null;
  hasUpcomingLotes: boolean;
}

type PendingAction =
  | 'pause'
  | 'resume'
  | 'finish'
  | 'openSelected'
  | 'openNext'
  | 'close'
  | 'timerPause'
  | 'timerResume'
  | 'timerReset'
  | 'timerRemaining'
  | 'timerAutoClose'
  | null;

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
  const [remainingSecondsInput, setRemainingSecondsInput] = useState('');

  const isLive = remate.status === 'live';
  const isPaused = remate.status === 'paused';

  // Cuenta regresiva (Épica 8, "cuenta regresiva y cierre automático") -- sin timer
  // en absoluto (el remate no configuró `settings.lote_timer_seconds`) los cinco
  // controles ni siquiera se muestran, mismo criterio que el resto del panel
  // (deshabilitar según precondición, nunca dejar pasar una acción que el backend
  // rechazaría con 422).
  const hasTimer = Boolean(
    activeLote && (activeLote.timer_ends_at !== null || activeLote.timer_paused_remaining_seconds !== null),
  );
  const isTimerPaused = Boolean(activeLote && activeLote.timer_paused_remaining_seconds !== null);
  const parsedRemainingSeconds = Number(remainingSecondsInput);
  const isRemainingSecondsValid =
    remainingSecondsInput.trim() !== '' &&
    Number.isInteger(parsedRemainingSeconds) &&
    parsedRemainingSeconds >= 0;

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

  async function submitRemainingSeconds() {
    if (!activeLote || !isRemainingSecondsValid) return;
    setPendingAction('timerRemaining');
    try {
      await setLoteTimerRemainingRequest(remate.id, activeLote.id, parsedRemainingSeconds);
      useToastStore.getState().push('success', 'Se actualizó el tiempo restante del timer.');
      setRemainingSecondsInput('');
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
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

      {hasTimer && activeLote && (
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Cuenta regresiva del lote
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                runSimpleAction(
                  'timerPause',
                  () => pauseLoteTimerRequest(remate.id, activeLote.id),
                  'El timer se pausó.',
                )
              }
              isLoading={pendingAction === 'timerPause'}
              disabled={!isLive || isTimerPaused || pendingAction !== null}
            >
              Pausar timer
            </Button>

            <Button
              onClick={() =>
                runSimpleAction(
                  'timerResume',
                  () => resumeLoteTimerRequest(remate.id, activeLote.id),
                  'El timer se reanudó.',
                )
              }
              isLoading={pendingAction === 'timerResume'}
              disabled={!isLive || !isTimerPaused || pendingAction !== null}
            >
              Reanudar timer
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                runSimpleAction(
                  'timerReset',
                  () => resetLoteTimerRequest(remate.id, activeLote.id),
                  'El timer se reinició.',
                )
              }
              isLoading={pendingAction === 'timerReset'}
              disabled={!isLive || pendingAction !== null}
            >
              Reiniciar timer
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                runSimpleAction(
                  'timerAutoClose',
                  () => setLoteTimerAutoCloseRequest(remate.id, activeLote.id, !activeLote.timer_auto_close_enabled),
                  activeLote.timer_auto_close_enabled
                    ? 'Se desactivó el cierre automático.'
                    : 'Se activó el cierre automático.',
                )
              }
              isLoading={pendingAction === 'timerAutoClose'}
              disabled={!isLive || pendingAction !== null}
            >
              {activeLote.timer_auto_close_enabled ? 'Desactivar cierre automático' : 'Activar cierre automático'}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Input
                label="Tiempo restante (segundos)"
                type="number"
                min={0}
                step={1}
                value={remainingSecondsInput}
                onChange={(event) => setRemainingSecondsInput(event.target.value)}
                disabled={!isLive || pendingAction !== null}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => void submitRemainingSeconds()}
              isLoading={pendingAction === 'timerRemaining'}
              disabled={!isLive || !isRemainingSecondsValid || pendingAction !== null}
            >
              Fijar tiempo restante
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
