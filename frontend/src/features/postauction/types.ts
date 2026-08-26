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
  lote_cover_image_url: string | null;
  remate_id: string;
  remate_title: string;
  buyer_id: string;
  buyer_name: string | null;
  /** Solo presentes en la respuesta que ve el rematador dueño (`GET /postauction/ventas`,
   * `PostAuctionCaseRematadorRead` en el backend) -- `GET /postauction/mis-compras`
   * (vista del comprador, `PostAuctionCaseRead`) no los trae, por eso son opcionales acá
   * y no campos requeridos. */
  buyer_email?: string | null;
  buyer_phone?: string | null;
  /** Pese al nombre, identifica a la EMPRESA dueña del remate -- ver comentario en
   * `backend/app/postauction/schemas.py`. Usar `empresa_name`/`operador_name` abajo para
   * mostrar cada rol con su rótulo correcto. */
  rematador_id: string;
  rematador_name: string | null;
  /** Nombre de la empresa creadora del remate (mismo valor que `rematador_name` hoy). */
  empresa_name?: string | null;
  /** Nombre de quien efectivamente operó el remate en vivo (`Remate.rematador_id`),
   * `null` si la empresa lo operó ella misma sin asignar a nadie. */
  operador_name?: string | null;
  /** Precio base del lote (`Lote.base_price`) -- agregado junto con el rediseño del
   * panel de detalle para mostrar "precio inicial" junto al final. */
  base_price: string;
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

export type PostAuctionDocumentType =
  | 'otro'
  | 'recibo'
  | 'factura'
  | 'ticket'
  | 'comprobante'
  | 'contrato'
  | 'guia_envio'
  | 'documento_entrega';

export interface PostAuctionDocument {
  id: string;
  document_type: PostAuctionDocumentType;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  url: string;
  uploaded_by_id: string | null;
  created_at: string;
}

export interface PostAuctionCaseDetail extends PostAuctionCase {
  timeline: TimelineEntry[];
  documents: PostAuctionDocument[];
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
