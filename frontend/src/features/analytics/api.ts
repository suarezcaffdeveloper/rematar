/**
 * Llamadas HTTP del feature de analítica (Épica 7, Módulo 7.1) -- mismo patrón que
 * `features/chat/api.ts`. Un único endpoint: no hay escritura, todo el módulo es de
 * lectura (ver `AnalyticsService`, backend).
 */

import { apiClient } from '../../shared/api/client';
import type { RemateAnalyticsSnapshot } from './types';

export async function fetchRemateAnalyticsRequest(
  remateId: string,
): Promise<RemateAnalyticsSnapshot> {
  const { data } = await apiClient.get<RemateAnalyticsSnapshot>(
    `/remates/${remateId}/analytics`,
  );
  return data;
}
