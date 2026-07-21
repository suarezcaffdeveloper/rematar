/**
 * Tipos que reflejan `backend/app/analytics/schemas.py` (Épica 7, Módulo 7.1). Ver
 * docs/35-dashboard-analitica-tiempo-real.md.
 *
 * Montos (`total_awarded_value`, `highest_oferta.amount`) llegan como `string`, mismo
 * motivo que `Lote.base_price`/`OfertaSnapshotEntry.amount` (`features/remates/types.ts`,
 * `features/sala/types.ts`): Pydantic v2 serializa `Decimal` preservando su
 * representación exacta.
 */

export interface LoteStatusCounts {
  pending: number;
  open: number;
  closed_sold: number;
  closed_unsold: number;
  cancelled: number;
  total: number;
}

export interface HighestOferta {
  oferta_id: string;
  lote_id: string;
  lot_number: string;
  lote_title: string;
  buyer_id: string;
  amount: string;
  status: 'accepted' | 'rejected' | 'outbid' | 'winning';
  created_at: string;
}

export interface TopLoteByOffers {
  lote_id: string;
  lot_number: string;
  lote_title: string;
  offer_count: number;
}

export interface BidsTimelineBucket {
  bucket_start: string;
  count: number;
}

export type RecentAnalyticsEventType =
  | 'lote.opened'
  | 'lote.closed_sold'
  | 'lote.closed_unsold'
  | 'remate.finished'
  | 'remate.cancelled';

export interface RecentAnalyticsEvent {
  event_type: RecentAnalyticsEventType;
  occurred_at: string;
  lote_id: string | null;
  lot_number: string | null;
  lote_title: string | null;
  final_price: string | null;
}

/** `RemateAnalyticsSnapshot` -- `GET /remates/{id}/analytics`, solo dueño o admin. */
export interface RemateAnalyticsSnapshot {
  schema_version: number;
  remate_id: string;
  connected_users_total: number;
  connected_buyers: number;
  lote_status_counts: LoteStatusCounts;
  average_lote_duration_seconds: number | null;
  total_awarded_value: string;
  total_ofertas: number;
  ofertas_per_minute: number;
  highest_oferta: HighestOferta | null;
  top_lote_by_offers: TopLoteByOffers | null;
  bids_timeline: BidsTimelineBucket[];
  recent_events: RecentAnalyticsEvent[];
  generated_at: string;
}
