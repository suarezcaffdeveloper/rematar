/**
 * Tipos que reflejan, campo por campo, `backend/app/modules/remates/schemas.py` y
 * `backend/app/modules/remates/models.py` (`RemateRead`, `RemateStatus`,
 * `RemateCategory`). Mantenidos a mano, mismo criterio que `features/auth/types.ts` --
 * ver docs/24-fundacion-frontend.md, "Trabajo futuro".
 */

/** `RemateStatus` del backend -- los mismos seis valores, ni uno más. */
export type RemateStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'finished' | 'cancelled';

/**
 * Estados que un comprador puede llegar a ver. `draft` queda afuera a propósito: el
 * backend nunca lo devuelve para un viewer que no es dueño ni admin
 * (`RemateService._is_visible`), así que no tiene sentido ofrecerlo como filtro acá.
 */
export type VisibleRemateStatus = Exclude<RemateStatus, 'draft'>;

/** `RemateCategory` del backend -- las mismas nueve categorías, ni una más. */
export type RemateCategory =
  | 'inmuebles'
  | 'vehiculos'
  | 'maquinaria_agricola'
  | 'hacienda'
  | 'arte_y_antiguedades'
  | 'electronica'
  | 'mobiliario'
  | 'indumentaria'
  | 'otros';

/** `RemateRead` -- `backend/app/modules/remates/schemas.py`. */
export interface Remate {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: RemateCategory;
  cover_image_url: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: RemateStatus;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Query params soportados por `GET /remates` (`backend/app/modules/remates/router.py`). */
export interface RemateListParams {
  page?: number;
  page_size?: number;
  category?: RemateCategory;
  status?: RemateStatus;
  owner_id?: string;
}

/** `LoteStatus` del backend (`lotes/models.py`) -- los mismos cinco valores, ni uno más. */
export type LoteStatus = 'pending' | 'open' | 'closed_sold' | 'closed_unsold' | 'cancelled';

/** `LoteImage` -- `backend/app/modules/remates/lotes/schemas.py`. */
export interface LoteImage {
  url: string;
  order: number;
  caption: string | null;
}

/**
 * `LoteRead` -- `backend/app/modules/remates/lotes/schemas.py`. Sin los campos de
 * precio (`base_price`, `min_increment`, `reserve_price`, `final_price`) ni
 * `attributes`/`documents`: este módulo (Épica 4.4) no muestra información de ofertas
 * todavía (explícitamente fuera de alcance), así que no hay pantalla que los use hoy --
 * se agregan cuando el módulo de ofertas/sala en vivo los necesite, no antes.
 */
export interface Lote {
  id: string;
  remate_id: string;
  lot_number: string;
  display_order: number;
  title: string;
  description: string | null;
  category: RemateCategory;
  images: LoteImage[];
  quantity: number;
  unit_label: string | null;
  status: LoteStatus;
  created_at: string;
}

/** Query params soportados por `GET /remates/{id}/lotes`. */
export interface LoteListParams {
  page?: number;
  page_size?: number;
}
