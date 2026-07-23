/**
 * Tipos que reflejan `backend/app/postauction/schemas.py` (Épica 7, Módulo 7.5). Ver
 * docs/41-gestion-post-remate.md.
 */

export type PostAuctionStatus =
  | 'adjudicado'
  | 'pendiente_contacto'
  | 'pago_pendiente'
  | 'pago_recibido'
  | 'preparando_entrega'
  | 'enviado'
  | 'entregado'
  | 'finalizado';

export interface PostAuctionCase {
  id: string;
  lote_id: string;
  lot_number: string;
  lote_title: string;
  remate_id: string;
  remate_title: string;
  buyer_id: string;
  buyer_name: string | null;
  rematador_id: string;
  rematador_name: string | null;
  final_price: string;
  status: PostAuctionStatus;
  contacted_at: string | null;
  payment_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  finalized_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: 'case_created' | 'status_changed' | 'note_added' | string;
  previous_status: PostAuctionStatus | null;
  new_status: PostAuctionStatus | null;
  note: string | null;
}

export interface PostAuctionCaseDetail extends PostAuctionCase {
  timeline: TimelineEntry[];
}

export interface PostAuctionListFilters {
  status?: PostAuctionStatus;
  remate_id?: string;
  search?: string;
}

export interface StatusChangeRequest {
  new_status: PostAuctionStatus;
  note?: string;
  occurred_at?: string;
}
