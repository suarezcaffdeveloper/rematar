/**
 * Tipos que reflejan `backend/app/modules/bots/schemas.py` (módulo de Bots
 * Simuladores). Mantenidos a mano, mismo criterio que `features/remates/types.ts` --
 * ver docs/24-fundacion-frontend.md, "Trabajo futuro".
 */

/** `BotPersonality` -- `backend/app/modules/bots/models.py`. */
export type BotPersonality = 'conservative' | 'competitive' | 'aggressive';

/** `BotSimulationStatus` -- `backend/app/modules/bots/models.py`. */
export type BotSimulationStatus = 'running' | 'paused' | 'stopped';

/**
 * `BotProfileRead` -- perfil reutilizable entre remates. Los montos/probabilidades
 * llegan como `string` (mismo motivo que `Lote.base_price` en
 * `features/remates/types.ts`: `Decimal` de Python serializado por Pydantic).
 */
export interface BotProfile {
  id: string;
  user_id: string;
  display_name: string;
  personality: BotPersonality;
  max_budget: string;
  reaction_delay_min_seconds: number;
  reaction_delay_max_seconds: number;
  continue_probability: string;
  participates_in_chat: boolean;
  chat_message_frequency: string;
  is_active: boolean;
}

/** Payload de creación/edición del formulario -- todos los campos como `string` porque
 * así es como los maneja un `<input>` controlado (mismo criterio que
 * `features/rematador/loteForm.ts`). */
export interface BotProfileFormPayload {
  display_name: string;
  personality: BotPersonality;
  max_budget: string;
  reaction_delay_min_seconds: number;
  reaction_delay_max_seconds: number;
  continue_probability: string;
  participates_in_chat: boolean;
  chat_message_frequency: string;
  is_active?: boolean;
}

/** `BotRosterEntry` -- un bot seleccionado para un remate puntual. */
export interface BotRosterEntry {
  bot_profile_id: string;
  user_id: string;
  display_name: string;
  is_enabled: boolean;
}

/** `BotSimulationRunRead` -- estado de control de la simulación de un remate. `null`
 * cuando todavía nunca se inició (`GET .../bots/simulation` devuelve `null` en ese
 * caso, ver `backend/app/modules/bots/router.py`). */
export interface BotSimulationRun {
  remate_id: string;
  status: BotSimulationStatus;
  started_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
}
