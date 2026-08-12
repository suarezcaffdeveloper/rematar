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

/** `RemateSettings` -- `backend/app/modules/remates/schemas.py`. `currency` (formatear
 * precios) y, desde Épica 8 ("cuenta regresiva y cierre automático"), los tres campos
 * de timer/anti-sniping ya se usan en la Consola Operativa y la Sala del Remate --
 * `anti_sniping_*` existían desde antes en el tipo por fidelidad con el schema, ahora
 * también tienen efecto real (ver `features/sala/components/LoteCountdown.tsx`). */
export interface RemateSettings {
  anti_sniping_enabled: boolean;
  anti_sniping_extension_seconds: number;
  currency: string;
  lote_timer_seconds: number | null;
}

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
  settings: RemateSettings;
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

/**
 * Body de `POST /remates` / `PATCH /remates/{id}` -- `RemateCreate`/`RemateUpdate`
 * (`backend/app/modules/remates/schemas.py`). Un único tipo para crear y editar (Épica
 * 5, Módulo 5.3: "formularios reutilizables") -- en `PATCH` el backend acepta el mismo
 * conjunto de campos, todos opcionales a nivel de transporte; enviar el objeto completo
 * en ambos casos es más simple que rastrear qué campo puntual cambió, y el backend no
 * distingue "no enviado" de "enviado igual al valor actual". `settings` es parcial
 * porque el propio schema del backend ya trae defaults (`RemateSettings`) si no se manda
 * completo.
 */
export interface RemateFormPayload {
  title: string;
  category: RemateCategory;
  description?: string | null;
  cover_image_url?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  settings?: Partial<RemateSettings>;
}

/** `LoteStatus` del backend (`lotes/models.py`) -- los mismos cinco valores, ni uno más. */
export type LoteStatus = 'pending' | 'open' | 'closed_sold' | 'closed_unsold' | 'cancelled';

/** `LoteImage` -- `backend/app/modules/remates/lotes/schemas.py`. */
export interface LoteImage {
  url: string;
  order: number;
  caption: string | null;
}

/** `LoteRead.attributes` -- `AttributeValue` en `backend/.../lotes/schemas.py`
 * (`str | int | float | bool`). Datos libres del lote (peso, raza, año, m2, etc.). */
export type LoteAttributeValue = string | number | boolean;

/**
 * `LoteRead` -- `backend/app/modules/remates/lotes/schemas.py`. Sin `documents`: ninguna
 * pantalla los usa todavía (a diferencia de `attributes`/precios, que la Sala del
 * Remate, Épica 4.5, sí necesita -- ver docs/26-detalle-remate.md, que deliberadamente
 * los había dejado afuera hasta este módulo).
 *
 * `base_price`/`min_increment`/`reserve_price`/`final_price` llegan como **string**, no
 * `number` -- confirmado contra una respuesta real de `GET /remates/{id}/snapshot`
 * (`"base_price": "1000.00"`): Pydantic v2 serializa `Decimal` a JSON preservando su
 * representación exacta en vez de convertir a `float` (evita el error de redondeo
 * binario de IEEE 754 para montos de dinero). `shared/lib/format.ts::formatCurrency`
 * hace el `Number(...)` en el único lugar que lo necesita.
 */
export interface Lote {
  id: string;
  remate_id: string;
  lot_number: string;
  display_order: number;
  title: string;
  description: string | null;
  category: RemateCategory;
  attributes: Record<string, LoteAttributeValue>;
  images: LoteImage[];
  quantity: number;
  unit_label: string | null;
  base_price: string;
  min_increment: string;
  // `null` para un comprador que no es dueño del remate (enmascarado por
  // `LoteService`/`SnapshotService`, ver ADR-016) -- nunca se muestra en la UI, pero se
  // refleja en el tipo por fidelidad con lo que el backend realmente devuelve.
  reserve_price: string | null;
  final_price: string | null;
  status: LoteStatus;
  // Cuenta regresiva (Épica 8, "cuenta regresiva y cierre automático", ADR-043) --
  // `timer_ends_at` es el deadline absoluto (ISO 8601, UTC) mientras corre; `null` si
  // está pausado o el lote nunca tuvo timer. Ver `features/sala/components/LoteCountdown.tsx`.
  timer_ends_at: string | null;
  timer_paused_remaining_seconds: number | null;
  timer_auto_close_enabled: boolean;
  // Ronda de adjudicación en curso (Módulo de lotes desiertos) -- 1 en un lote que
  // nunca fue reincorporado a la cola. Ver `LoteRound` (historial de rondas
  // anteriores, `GET .../lotes/{id}/rounds`).
  round_number: number;
  created_at: string;
}

/** `LoteRoundRead` -- `backend/app/modules/remates/lotes/schemas.py`. Ronda desierta
 * archivada de un lote (Módulo de lotes desiertos): condiciones comerciales vigentes
 * en esa ronda, más quién y cuándo decidió reincorporarlo. `reserve_price` sigue el
 * mismo enmascarado que `Lote.reserve_price` para un viewer que no es dueño ni admin. */
export interface LoteRound {
  id: string;
  round_number: number;
  base_price: string;
  min_increment: string;
  reserve_price: string | null;
  opened_at: string | null;
  closed_at: string;
  requeued_at: string;
  requeued_by_name: string | null;
}

/** Body de `POST /remates/{id}/lotes/{lote_id}/requeue` -- `LoteRequeueRequest`
 * (Módulo de lotes desiertos). Los tres campos son opcionales: si no vienen, la nueva
 * ronda arranca con las mismas condiciones comerciales de la ronda anterior. */
export interface LoteRequeuePayload {
  base_price?: string;
  min_increment?: string;
  reserve_price?: string | null;
}

/** Query params soportados por `GET /remates/{id}/lotes`. */
export interface LoteListParams {
  page?: number;
  page_size?: number;
}

/** Body de `POST /remates/{id}/lotes/{lote_id}/close` -- `backend/app/modules/remates/
 * lotes/schemas.py::LoteCloseRequest` (Épica 2.3, ADR-018; consumido desde la Consola
 * Operativa del Rematador, Épica 5.2). `final_price` es `string` (no `number`), mismo
 * motivo que `base_price`/`min_increment` -- Pydantic acepta un string numérico para un
 * campo `Decimal` sin perder precisión. Obligatorio si `outcome` es `"sold"`, debe venir
 * ausente si es `"unsold"` (el backend valida esto igual, esto solo espeja el contrato). */
export interface LoteClosePayload {
  outcome: 'sold' | 'unsold';
  final_price?: string;
}

/**
 * Body de `POST /remates/{id}/lotes` / `PATCH /remates/{id}/lotes/{lote_id}` --
 * `LoteCreate`/`LoteUpdate` (`backend/app/modules/remates/lotes/schemas.py`). Mismo
 * criterio que `RemateFormPayload`: un único tipo para crear y editar. No incluye
 * `display_order` (solo cambia vía `reorderLotesRequest`) ni `status` (sin transición
 * expuesta por `PATCH`, ver `docs/15-modulo-lote.md`). `base_price`/`min_increment`/
 * `reserve_price` son `string`, mismo motivo que `Lote` (arriba).
 */
export interface LoteFormPayload {
  lot_number: string;
  title: string;
  category: RemateCategory;
  description?: string | null;
  attributes?: Record<string, LoteAttributeValue>;
  images?: LoteImage[];
  quantity?: number;
  unit_label?: string | null;
  base_price: string;
  min_increment: string;
  reserve_price?: string | null;
}
