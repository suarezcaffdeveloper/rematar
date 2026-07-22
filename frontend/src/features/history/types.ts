/**
 * Tipos que reflejan `backend/app/history/schemas.py` (Épica 7, Módulo 7.3). Ver
 * docs/37-historial-y-resultados-de-remates.md.
 *
 * Reutiliza literalmente `HighestOferta`/`TopLoteByOffers`/`LoteStatusCounts` de
 * `features/analytics/types.ts` -- mismos campos que ya devuelve Analítica, sin
 * redefinirlos (mismo criterio que el backend, ver `app/history/schemas.py`).
 */

import type { HighestOferta, LoteStatusCounts, TopLoteByOffers } from '../analytics/types';
import type { Page } from '../../shared/api/types';
import type { RemateCategory, RemateStatus } from '../remates/types';

export type HistorySortOption =
  | 'date_desc'
  | 'date_asc'
  | 'title_asc'
  | 'title_desc'
  | 'amount_desc'
  | 'amount_asc';

export interface HistoryListFilters {
  search?: string;
  date_from?: string;
  date_to?: string;
  sort?: HistorySortOption;
}

/** `FinishedRemateSummary` -- una fila del listado de remates finalizados/cancelados. */
export interface FinishedRemateSummary {
  id: string;
  title: string;
  category: RemateCategory;
  status: RemateStatus;
  starts_at: string | null;
  resolved_at: string | null;
  lote_count: number;
  lotes_sold_count: number;
  total_awarded_value: string;
  buyer_count: number;
  duration_seconds: number | null;
  owner_id: string;
  owner_name: string | null;
}

export interface ChatActivitySummary {
  message_count: number;
  deleted_count: number;
  participant_count: number;
}

/** `RemateHistoryDetail` -- `GET /history/remates/{id}`, solo dueño o admin. */
export interface RemateHistoryDetail {
  remate_id: string;
  title: string;
  category: RemateCategory;
  status: RemateStatus;
  starts_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  duration_seconds: number | null;
  lote_status_counts: LoteStatusCounts;
  average_lote_duration_seconds: number | null;
  total_awarded_value: string;
  total_ofertas: number;
  highest_oferta: HighestOferta | null;
  top_lote_by_offers: TopLoteByOffers | null;
  chat_activity: ChatActivitySummary;
  participants_count: number;
  generated_at: string;
}

export interface OfertaHistoryEntry {
  id: string;
  buyer_id: string;
  buyer_name: string | null;
  amount: string;
  status: 'accepted' | 'rejected' | 'outbid' | 'winning';
  rejection_reason: string | null;
  created_at: string;
}

export interface LoteWinner {
  buyer_id: string;
  buyer_name: string | null;
  amount: string;
}

/** `LoteHistoryDetail` -- `GET /history/remates/{id}/lotes/{loteId}`, solo dueño o admin. */
export interface LoteHistoryDetail {
  id: string;
  remate_id: string;
  lot_number: string;
  title: string;
  category: RemateCategory;
  status: 'pending' | 'open' | 'closed_sold' | 'closed_unsold' | 'cancelled';
  base_price: string;
  final_price: string | null;
  winner: LoteWinner | null;
  offer_count: number;
  time_open_seconds: number | null;
  opened_at: string | null;
  closed_at: string | null;
  cancellation_reason: string | null;
  offer_history: Page<OfertaHistoryEntry>;
}
