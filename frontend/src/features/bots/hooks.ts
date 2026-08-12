/**
 * Hooks del feature de bots simuladores -- orquestan `api.ts` y exponen estado de
 * carga/error/datos, mismo patrón que `features/remates/hooks.ts`.
 */

import type { NormalizedApiError } from '../../shared/api/errors';
import { useAsyncResource } from '../../shared/hooks/useAsyncResource';
import {
  fetchBotProfilesRequest,
  fetchBotRosterRequest,
  fetchBotSimulationRequest,
} from './api';
import type { BotProfile, BotRosterEntry, BotSimulationRun } from './types';

export interface UseBotProfilesResult {
  bots: BotProfile[];
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Todos los bots propios (gestión global, reutilizable entre remates) --
 * `BotProfilesPage` y el selector de `ConsolaBotsPanel`. */
export function useBotProfiles(): UseBotProfilesResult {
  const {
    data: bots,
    isLoading,
    error,
    reload,
  } = useAsyncResource<BotProfile[]>(() => fetchBotProfilesRequest(), [], []);

  return { bots, isLoading, error, reload };
}

interface BotRemateState {
  roster: BotRosterEntry[];
  run: BotSimulationRun | null;
}

export interface UseBotSimulationResult {
  roster: BotRosterEntry[];
  run: BotSimulationRun | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Selección + estado de control de la simulación de UN remate puntual -- lo que
 * consume `ConsolaBotsPanel`. Ambos datos se piden juntos porque siempre se muestran
 * juntos (el checklist de selección y los botones Iniciar/Pausar/Detener). */
export function useBotSimulation(remateId: string): UseBotSimulationResult {
  const {
    data: { roster, run },
    isLoading,
    error,
    reload,
  } = useAsyncResource<BotRemateState>(
    async () => {
      const [roster, run] = await Promise.all([
        fetchBotRosterRequest(remateId),
        fetchBotSimulationRequest(remateId),
      ]);
      return { roster, run };
    },
    [remateId],
    { roster: [], run: null },
    { enabled: Boolean(remateId) },
  );

  return { roster, run, isLoading, error, reload };
}
