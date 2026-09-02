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

/** `RemateAccessType` del backend -- `public` (comportamiento de siempre, visible en
 * "Remates disponibles") o `private` (oculto del listado, requiere URL + código, ver
 * `RedeemPrivateAccessPage`). Elegible solo al crear -- no forma parte de
 * `RemateFormPayload` en modo edición. */
export type RemateAccessType = 'public' | 'private';

/** `RemateCategory` del backend -- las mismas nueve categorías, ni una más. */
export type RemateCategory =
  | 'inmuebles'
  | 'vehiculos'
  | 'maquinaria_pesada_y_agricola'
  | 'hacienda'
  | 'arte_antiguedades_y_coleccionables'
  | 'joyas_relojeria_y_numismatica'
  | 'tecnologia_electrodomesticos_y_hogar'
  | 'nautica_y_aviacion'
  | 'mercaderia_e_indumentaria';

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
  // `null`/`undefined` hasta que un usuario `rematador` canjea un código de operador
  // (ADR-048, ver `generateOperatorCodeRequest`/`claimOperatorRequest` en `api.ts`).
  // Opcional a nivel de tipo (aunque el backend siempre lo manda) para no romper los
  // fixtures de prueba ya existentes que arman un `Remate` a mano sin este campo --
  // mismo criterio pragmático que el resto de este archivo ("mantenido a mano").
  rematador_id?: string | null;
  title: string;
  description: string | null;
  category: RemateCategory;
  cover_image_url: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: RemateStatus;
  // Opcionales a nivel de tipo (aunque el backend siempre los manda), mismo criterio
  // pragmático que `rematador_id` arriba -- no romper los fixtures de prueba existentes
  // que arman un `Remate` a mano sin estos dos campos, nuevos en esta revisión.
  // `undefined` se trata igual que `'public'` en cualquier chequeo (`remate.access_type
  // === 'private'` da `false`), que es el default real del backend.
  access_type?: RemateAccessType;
  // `null` hasta que se genera un código (o después de que el remate nace público). El
  // código en sí NUNCA viaja acá en texto plano -- solo en `RemateCreateResponse.
  // private_access_code`/`PrivateAccessCodeResponse.code` (`POST` o `GET
  // /remates/{id}/private-access-code`, ver `getPrivateAccessCodeRequest` en `api.ts`).
  private_access_code_generated_at?: string | null;
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
  rematador_id?: string;
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
  // Solo tiene efecto al crear (`RemateCreate.access_type`) -- el backend lo ignora en
  // un `PATCH` (`RemateUpdate` no lo incluye), así que da igual mandarlo también ahí.
  access_type?: RemateAccessType;
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
  // Reencolado preautorizado (ADR-048): si está habilitado, cualquiera con acceso a la
  // Consola Operativa (empresa dueña o rematador operador) puede disparar
  // `requeueLotePresetRequest` con este precio/incremento exactos cuando el lote quede
  // `closed_unsold`, sin que el rematador pueda elegir otro monto. Opcionales a nivel de
  // tipo (aunque el backend siempre los manda) por el mismo motivo que
  // `Remate.rematador_id` -- no romper los fixtures de prueba existentes.
  requeue_preset_enabled?: boolean;
  requeue_preset_base_price?: string | null;
  requeue_preset_min_increment?: string | null;
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
  requeue_preset_enabled?: boolean;
  requeue_preset_base_price?: string | null;
  requeue_preset_min_increment?: string | null;
}

/** Respuesta de `POST /remates/{id}/operator-code` -- el código se muestra una única
 * vez, nunca se vuelve a poder consultar (ADR-048). */
export interface OperatorCodeResponse {
  code: string;
  generated_at: string;
}

/** Respuesta de `GET /remates/{id}/private-access-code` (código actual, sin
 * regenerarlo -- `getPrivateAccessCodeRequest`) y de `POST /remates/{id}/
 * private-access-code` (genera/regenera -- `generatePrivateAccessCodeRequest`). A
 * diferencia de `OperatorCodeResponse`, el código SÍ se puede volver a consultar (se
 * persiste cifrado, no hasheado, en el backend) -- y regenerar NO revoca los accesos ya
 * otorgados (a diferencia del código de operador). */
export interface PrivateAccessCodeResponse {
  code: string;
  generated_at: string;
}

/** Respuesta de `POST /remates` cuando el remate creado es privado -- `Remate` + el
 * código en texto plano. Ya no es la única forma de verlo (ver `PrivateAccessCodeResponse`/
 * `getPrivateAccessCodeRequest`), pero sigue siendo útil para mostrarlo sin un segundo
 * request. `private_access_code` es `null` si el remate es público.
 */
export interface RemateCreateResponse extends Remate {
  private_access_code: string | null;
}
