/**
 * "Mi actividad" (pantalla de perfil, comprador) -- todavía no existe un endpoint de
 * backend que agregue estas métricas por usuario (el único endpoint de perfil hoy es
 * `GET /users/me`, que solo devuelve los datos de cuenta). Datos de ejemplo realistas
 * mientras tanto; reemplazar por un fetch real el día que ese endpoint exista.
 */
export interface BuyerActivityStats {
  rematesParticipados: number;
  ofertasRealizadas: number;
  lotesAdjudicados: number;
  totalAdjudicado: string;
  currency: string;
}

export const MOCK_BUYER_ACTIVITY: BuyerActivityStats = {
  rematesParticipados: 14,
  ofertasRealizadas: 52,
  lotesAdjudicados: 6,
  totalAdjudicado: '18450000',
  currency: 'ARS',
};
