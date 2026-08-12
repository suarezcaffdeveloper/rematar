/**
 * Llamadas HTTP del feature de bots simuladores -- funciones puras, sin estado, mismo
 * patrón que `features/remates/api.ts`. Todas usan `apiClient` (autenticado): no hay
 * endpoint público de bots, solo un rematador con sesión llega acá.
 */

import { apiClient } from '../../shared/api/client';
import type { BotProfile, BotProfileFormPayload, BotRosterEntry, BotSimulationRun } from './types';

export async function fetchBotProfilesRequest(): Promise<BotProfile[]> {
  const { data } = await apiClient.get<BotProfile[]>('/bots');
  return data;
}

export async function createBotProfileRequest(payload: BotProfileFormPayload): Promise<BotProfile> {
  const { data } = await apiClient.post<BotProfile>('/bots', payload);
  return data;
}

export async function updateBotProfileRequest(
  botId: string,
  payload: Partial<BotProfileFormPayload>,
): Promise<BotProfile> {
  const { data } = await apiClient.patch<BotProfile>(`/bots/${botId}`, payload);
  return data;
}

export async function deleteBotProfileRequest(botId: string): Promise<void> {
  await apiClient.delete(`/bots/${botId}`);
}

export async function fetchBotRosterRequest(remateId: string): Promise<BotRosterEntry[]> {
  const { data } = await apiClient.get<BotRosterEntry[]>(`/remates/${remateId}/bots/roster`);
  return data;
}

export async function setBotSelectionRequest(remateId: string, botProfileIds: string[]): Promise<void> {
  await apiClient.put(`/remates/${remateId}/bots/selection`, { bot_profile_ids: botProfileIds });
}

export async function fetchBotSimulationRequest(remateId: string): Promise<BotSimulationRun | null> {
  const { data } = await apiClient.get<BotSimulationRun | null>(`/remates/${remateId}/bots/simulation`);
  return data;
}

export async function startBotSimulationRequest(remateId: string): Promise<BotSimulationRun> {
  const { data } = await apiClient.post<BotSimulationRun>(`/remates/${remateId}/bots/simulation/start`);
  return data;
}

export async function pauseBotSimulationRequest(remateId: string): Promise<BotSimulationRun> {
  const { data } = await apiClient.post<BotSimulationRun>(`/remates/${remateId}/bots/simulation/pause`);
  return data;
}

export async function stopBotSimulationRequest(remateId: string): Promise<BotSimulationRun> {
  const { data } = await apiClient.post<BotSimulationRun>(`/remates/${remateId}/bots/simulation/stop`);
  return data;
}
