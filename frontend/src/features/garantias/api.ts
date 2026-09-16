/**
 * Llamadas HTTP de la Garantía Económica -- mismo patrón que `features/remates/api.ts`:
 * funciones puras sin estado, `apiClient` autenticado (la ruta `/remates/:id/sala` vive
 * detrás de `RequireAuth`, un comprador siempre tiene sesión para llegar acá).
 */

import { apiClient } from '../../shared/api/client';
import type { CardPaymentBrickData, Garantia } from './types';

/** `GET /remates/{id}/garantia/me` -- `null` en el cuerpo si el comprador todavía no
 * constituyó ninguna garantía para este remate (no es un 404: es un estado válido). */
export async function fetchMyGarantiaRequest(remateId: string): Promise<Garantia | null> {
  const { data } = await apiClient.get<Garantia | null>(`/remates/${remateId}/garantia/me`);
  return data;
}

/** `POST /remates/{id}/garantia` -- siempre 201, incluido un rechazo de tarjeta
 * (`status: 'failed'` en el cuerpo, no un error HTTP -- mismo criterio que
 * `placeBidRequest`, ver `backend/app/modules/garantias/router.py`). */
export async function createGarantiaRequest(
  remateId: string,
  cardPaymentData: CardPaymentBrickData,
): Promise<Garantia> {
  const { data } = await apiClient.post<Garantia>(`/remates/${remateId}/garantia`, {
    card_payment_data: cardPaymentData,
  });
  return data;
}
