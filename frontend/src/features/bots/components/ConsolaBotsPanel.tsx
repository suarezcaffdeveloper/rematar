import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, PauseCircle, PlayCircle, Settings, StopCircle } from 'lucide-react';
import clsx from 'clsx';
import { normalizeApiError } from '../../../shared/api/errors';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  pauseBotSimulationRequest,
  setBotSelectionRequest,
  startBotSimulationRequest,
  stopBotSimulationRequest,
} from '../api';
import { useBotProfiles, useBotSimulation } from '../hooks';
import { PERSONALITY_BADGE_VARIANTS, PERSONALITY_LABELS, SIMULATION_STATUS_BADGE_VARIANTS, SIMULATION_STATUS_LABELS } from '../labels';

export interface ConsolaBotsPanelProps {
  remateId: string;
}

type PendingAction = 'start' | 'pause' | 'stop' | null;

/**
 * Panel "Simuladores" de la Consola Operativa -- selección de qué bots propios
 * participan en este remate puntual y control Iniciar/Pausar/Detener de la simulación
 * (módulo de Bots Simuladores). Se maneja aparte del resto de la consola, con su propia
 * carga de datos (`useBotProfiles`/`useBotSimulation`) -- `useLiveRemateState` no trae
 * nada de bots, este panel no necesita ningún evento de WebSocket para mostrar su propio
 * estado, solo lo pide de nuevo tras cada acción.
 */
export function ConsolaBotsPanel({ remateId }: ConsolaBotsPanelProps) {
  const { bots, isLoading: isLoadingBots } = useBotProfiles();
  const { roster, run, isLoading: isLoadingRoster, reload } = useBotSimulation(remateId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    setSelectedIds(new Set(roster.map((entry) => entry.bot_profile_id)));
  }, [roster]);

  const status = run?.status ?? 'stopped';
  const canEditSelection = status === 'stopped';
  const hasActiveBots = bots.filter((bot) => bot.is_active).length > 0;

  async function toggleSelection(botId: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(botId);
    else next.delete(botId);
    setSelectedIds(next);
    setPendingBotId(botId);
    try {
      await setBotSelectionRequest(remateId, Array.from(next));
    } catch (err) {
      setSelectedIds(selectedIds); // revierte
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingBotId(null);
    }
  }

  async function runControlAction(action: Exclude<PendingAction, null>, successMessage: string) {
    setPendingAction(action);
    try {
      const request =
        action === 'start' ? startBotSimulationRequest : action === 'pause' ? pauseBotSimulationRequest : stopBotSimulationRequest;
      await request(remateId);
      useToastStore.getState().push('success', successMessage);
      reload();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoadingBots || isLoadingRoster) return null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          <Bot aria-hidden="true" className="h-4 w-4 text-slate-400" />
          Simuladores
        </h2>
        <Badge variant={SIMULATION_STATUS_BADGE_VARIANTS[status]}>{SIMULATION_STATUS_LABELS[status]}</Badge>
      </div>

      {!hasActiveBots ? (
        <p className="text-sm text-slate-500">
          Todavía no tenés simuladores activos.{' '}
          <Link to="/simuladores" className="font-medium text-brand-600 hover:text-brand-700">
            Creá uno acá
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bots
            .filter((bot) => bot.is_active)
            .map((bot) => (
              <li key={bot.id}>
                <label
                  className={clsx(
                    'flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm',
                    canEditSelection ? 'cursor-pointer hover:bg-slate-50' : 'opacity-70',
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(bot.id)}
                      disabled={!canEditSelection || pendingBotId === bot.id}
                      onChange={(event) => toggleSelection(bot.id, event.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="truncate font-medium text-slate-800">{bot.display_name}</span>
                  </span>
                  <Badge variant={PERSONALITY_BADGE_VARIANTS[bot.personality]}>
                    {PERSONALITY_LABELS[bot.personality]}
                  </Badge>
                </label>
              </li>
            ))}
        </ul>
      )}

      {!canEditSelection && (
        <p className="text-xs text-slate-400">Detené la simulación para cambiar qué bots participan.</p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
        {status === 'stopped' && (
          <Button
            variant="success-soft"
            onClick={() => runControlAction('start', 'Simuladores iniciados.')}
            isLoading={pendingAction === 'start'}
            disabled={selectedIds.size === 0 || pendingAction !== null}
          >
            <PlayCircle aria-hidden="true" className="h-4 w-4" />
            Iniciar simuladores
          </Button>
        )}
        {status === 'paused' && (
          <Button
            variant="brand-soft"
            onClick={() => runControlAction('start', 'Simuladores reanudados.')}
            isLoading={pendingAction === 'start'}
            disabled={pendingAction !== null}
          >
            <PlayCircle aria-hidden="true" className="h-4 w-4" />
            Reanudar simuladores
          </Button>
        )}
        {status === 'running' && (
          <Button
            variant="warning-soft"
            onClick={() => runControlAction('pause', 'Simuladores pausados.')}
            isLoading={pendingAction === 'pause'}
            disabled={pendingAction !== null}
          >
            <PauseCircle aria-hidden="true" className="h-4 w-4" />
            Pausar simuladores
          </Button>
        )}
        {(status === 'running' || status === 'paused') && (
          <Button
            variant="danger"
            onClick={() => runControlAction('stop', 'Simuladores detenidos.')}
            isLoading={pendingAction === 'stop'}
            disabled={pendingAction !== null}
          >
            <StopCircle aria-hidden="true" className="h-4 w-4" />
            Detener simuladores
          </Button>
        )}
        <Link
          to="/simuladores"
          className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          <Settings aria-hidden="true" className="h-3.5 w-3.5" />
          Administrar simuladores
        </Link>
      </div>
    </div>
  );
}
