/**
 * Llamadas HTTP del feature de remates -- funciones puras, sin estado, mismo patrón que
 * `features/auth/api.ts`. Todas usan `apiClient` (autenticado, con refresh automático):
 * no hay endpoint público de remates, un comprador siempre tiene sesión para llegar acá
 * (vive detrás de `RequireAuth`).
 */

import { isAxiosError } from 'axios';
import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type {
  Lote,
  LoteClosePayload,
  LoteFormPayload,
  LoteImage,
  LoteListParams,
  LoteRequeuePayload,
  LoteRound,
  OperatorCodeResponse,
  PrivateAccessCodeResponse,
  Remate,
  RemateCreateResponse,
  RemateFormPayload,
  RemateListParams,
} from './types';

export async function fetchRematesRequest(params: RemateListParams): Promise<Page<Remate>> {
  const { data } = await apiClient.get<Page<Remate>>('/remates', { params });
  return data;
}

/**
 * CRUD de `Remate` (Épica 2, Módulo 2.1, `backend/app/modules/remates/router.py`) --
 * consumido por la Gestión de Remates y Lotes (Épica 5, Módulo 5.3). `update` solo
 * funciona con el remate en `draft`/`scheduled` (`RemateService.update`, 422 en
 * cualquier otro estado); `deleteRemateRequest` solo con `draft`/`cancelled` (422 si
 * no, sugiriendo `cancelar` en su lugar para uno programado o en curso --
 * `finished` queda deliberadamente afuera de ambos, ver `RemateService.soft_delete`)
 * -- todas estas reglas ya las valida el backend, el frontend las refleja
 * deshabilitando la acción correspondiente antes de intentarla.
 */
export async function createRemateRequest(payload: RemateFormPayload): Promise<RemateCreateResponse> {
  const { data } = await apiClient.post<RemateCreateResponse>('/remates', payload);
  return data;
}

export async function updateRemateRequest(remateId: string, payload: RemateFormPayload): Promise<Remate> {
  const { data } = await apiClient.patch<Remate>(`/remates/${remateId}`, payload);
  return data;
}

/**
 * Sube la imagen de portada de un remate (refinamiento visual, item 6 -- reemplaza el
 * campo de URL manual por selección de archivo real). Sin `remateId` a propósito: se
 * llama desde `RemateFormModal` en modo creación, antes de que exista ningún remate --
 * mismo criterio de "dos operaciones separadas" que `uploadLoteImageRequest`/
 * `updateLoteImagesRequest` (Épica 6, Módulo 6.1): esto solo sube el archivo y devuelve
 * la URL, quien la usa decide cuándo asignarla a `cover_image_url` y persistirla con
 * `createRemateRequest`/`updateRemateRequest` (sin cambios en esos dos, ninguno de los
 * dos sabe que la URL vino de un archivo en vez de haberse tipeado a mano).
 */
export async function uploadRemateCoverImageRequest(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ url: string }>('/remates/cover-image', formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function deleteRemateRequest(remateId: string): Promise<void> {
  await apiClient.delete(`/remates/${remateId}`);
}

/** `DRAFT -> SCHEDULED` -- exige `starts_at` ya definido y futuro (`RemateService.
 * schedule`). En la interfaz se presenta como "Publicar remate" (ver docs/31-gestion-
 * remates-lotes.md): es la misma transición, "programar" y "publicar" no son dos
 * acciones del backend, una sola que hace público al remate en la fecha indicada. */
export async function scheduleRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/schedule`);
  return data;
}

export async function cancelRemateRequest(remateId: string, reason: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/cancel`, { reason });
  return data;
}

/** `GET /remates/{id}` -- 404 (vía `normalizeApiError`) si no existe o no es visible
 * para el usuario actual (`RemateService.get_visible_or_raise`). */
export async function fetchRemateByIdRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.get<Remate>(`/remates/${remateId}`);
  return data;
}

export async function fetchLotesRequest(
  remateId: string,
  params: LoteListParams,
): Promise<Page<Lote>> {
  const { data } = await apiClient.get<Page<Lote>>(`/remates/${remateId}/lotes`, { params });
  return data;
}

/**
 * `RemateRead` no trae cantidad de lotes (no existe ese campo en el backend, ver
 * docs/25-dashboard-comprador.md, "Limitaciones conocidas") -- la única forma de
 * conocerla es pedir la primera página de lotes de ESE remate y quedarse con `total`
 * del envelope de paginación. `page_size: 1` para no traer datos que se van a
 * descartar; es una request aparte por remate (N+1), asumido y documentado, no una
 * optimización pendiente de esta fase.
 */
export async function fetchLoteCountRequest(remateId: string): Promise<number> {
  const { data } = await apiClient.get<Page<unknown>>(`/remates/${remateId}/lotes`, {
    params: { page: 1, page_size: 1 },
  });
  return data.total;
}

/** Detalle completo de un lote puntual (`GET /remates/{id}/lotes/{loteId}`, incluye
 * `images`/`description`) -- a diferencia de `fetchLotesRequest`, no depende de tener ya
 * la lista completa de lotes en memoria. */
export async function fetchLoteByIdRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.get<Lote>(`/remates/${remateId}/lotes/${loteId}`);
  return data;
}

/**
 * Cuántos usuarios están conectados a la sala de un remate en este momento -- mismo
 * `GET /remates/{id}/snapshot` que usa `features/sala` (`useRemateSnapshot`), pero
 * tipado acá solo con el único campo que este feature necesita (`connected_users`) para
 * no importar `RemateStateSnapshot` de `sala` -- `sala` ya depende de `remates` (por
 * ejemplo `GavelIcon`), depender también en el otro sentido crearía un ciclo entre
 * features. Snapshot HTTP puntual, sin WebSocket: el número queda desactualizado si
 * alguien entra o sale después de pedirlo, igual que `fetchLoteCountRequest`.
 */
export async function fetchConnectedUsersCountRequest(remateId: string): Promise<number> {
  const { data } = await apiClient.get<{ connected_users: number }>(`/remates/${remateId}/snapshot`);
  return data.connected_users;
}

/**
 * Transiciones del motor de estados de `Remate` (Épica 2, Módulo 2.3,
 * `backend/app/modules/remates/router.py`) -- ninguna lleva body, las cuatro devuelven
 * el `Remate` ya actualizado. `start`/`resume`/`finish` se agregaron en el Dashboard del
 * Rematador (Épica 5, Módulo 5.1); `pause` se agrega acá, en la Consola Operativa (Épica
 * 5, Módulo 5.2) -- es una acción de control en vivo, no de repaso (ver
 * docs/adr/ADR-032-dashboard-rematador.md, sección D). `schedule`/`cancel` de `Remate`
 * siguen sin consumidor en el frontend (ver docs/30-consola-operativa-rematador.md,
 * "Trabajo futuro").
 */
export async function startRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/start`);
  return data;
}

export async function pauseRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/pause`);
  return data;
}

export async function resumeRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/resume`);
  return data;
}

export async function finishRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/finish`);
  return data;
}

/**
 * Asignación de operador (ADR-048): la empresa dueña genera/regenera el código
 * (`generateOperatorCodeRequest`, texto plano devuelto una única vez -- el backend nunca
 * lo persiste así) y se lo comparte fuera de banda con un usuario `rematador`, que lo
 * canjea (`claimOperatorRequest`) para quedar asignado como `Remate.rematador_id`.
 * Regenerar revoca al operador anterior en la misma operación.
 */
export async function generateOperatorCodeRequest(remateId: string): Promise<OperatorCodeResponse> {
  const { data } = await apiClient.post<OperatorCodeResponse>(`/remates/${remateId}/operator-code`);
  return data;
}

export async function claimOperatorRequest(remateId: string, code: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/claim-operator`, { code });
  return data;
}

/**
 * Remates privados: acceso vía URL + código en vez de listado público (misma sala,
 * mismo motor de pujas -- ver `PrivateAccessCredentials`/`RedeemPrivateAccessPage`).
 * `generatePrivateAccessCodeRequest` genera/regenera (invalida el código anterior para
 * quien todavía no lo canjeó, pero NO revoca los accesos ya otorgados -- a diferencia
 * del código de operador). `getPrivateAccessCodeRequest`, más abajo, trae el código
 * actual sin regenerarlo. `redeemPrivateAccessRequest` canjea el código y deja al
 * comprador con acceso persistente a ESE remate puntual -- el detalle/sala funcionan
 * después sin volver a canjear.
 */
export async function generatePrivateAccessCodeRequest(
  remateId: string,
): Promise<PrivateAccessCodeResponse> {
  const { data } = await apiClient.post<PrivateAccessCodeResponse>(
    `/remates/${remateId}/private-access-code`,
  );
  return data;
}

/**
 * Trae el código de acceso ACTUAL de un remate privado sin regenerarlo -- a diferencia
 * de `generatePrivateAccessCodeRequest` (que siempre crea uno nuevo), este es el que
 * hay que usar para simplemente mostrar/copiar el código ya existente (card del
 * dashboard, Consola Operativa). `null` si el remate privado todavía no tiene código
 * generado (404 del backend).
 */
export async function getPrivateAccessCodeRequest(
  remateId: string,
): Promise<PrivateAccessCodeResponse | null> {
  try {
    const { data } = await apiClient.get<PrivateAccessCodeResponse>(
      `/remates/${remateId}/private-access-code`,
    );
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function redeemPrivateAccessRequest(remateId: string, code: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/redeem-private-access`, {
    code,
  });
  return data;
}

/** Remates privados a los que el usuario actual ya canjeó el código alguna vez --
 * `RedeemPrivateAccessPage` los muestra debajo del formulario de canje para volver a
 * entrar sin re-tipear nada (el grant ya persiste, ver `RemateAccessGrant`). */
export async function fetchMyPrivateAccessGrantsRequest(): Promise<Remate[]> {
  const { data } = await apiClient.get<Remate[]>('/remates/private/mine');
  return data;
}

/**
 * Transiciones del motor de estados de `Lote` (Épica 2, Módulo 2.3,
 * `backend/app/modules/remates/lotes/router.py`) -- consumidas por la Consola Operativa
 * del Rematador (Épica 5, Módulo 5.2). `open`/`close` operan sobre un lote puntual;
 * `openNext` (RF-13, "pasar al siguiente lote") elige el `PENDING` de menor
 * `display_order` sin que el cliente tenga que indicar cuál.
 */
export async function openLoteRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/open`);
  return data;
}

export async function openNextLoteRequest(remateId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/next`);
  return data;
}

export async function closeLoteRequest(
  remateId: string,
  loteId: string,
  payload: LoteClosePayload,
): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/close`, payload);
  return data;
}

/**
 * Reincorpora un lote desierto (`closed_unsold`) a la cola de pendientes, al final de
 * la cola actual (Módulo de lotes desiertos, `LoteService.requeue`) -- decisión siempre
 * del rematador, nunca automática. `payload` es opcional: sin condiciones nuevas, la
 * nueva ronda conserva el precio inicial/incremento/reserva de la ronda anterior.
 */
export async function requeueLoteRequest(
  remateId: string,
  loteId: string,
  payload: LoteRequeuePayload = {},
): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/requeue`, payload);
  return data;
}

/**
 * Reencolado preautorizado (ADR-048): igual resultado que `requeueLoteRequest`, pero
 * sin body -- siempre usa el precio/incremento que la empresa dejó cargado en el lote
 * (`Lote.requeue_preset_*`), nunca uno que el caller intente mandar. Es la única vía de
 * reencolado que el rematador operador (no dueño) puede usar; la empresa también puede
 * llamarlo (le ahorra repetir el precio a mano), pero para un precio distinto sigue
 * estando `requeueLoteRequest`, exclusivo de la empresa.
 */
export async function requeueLotePresetRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(
    `/remates/${remateId}/lotes/${loteId}/requeue-preset`,
  );
  return data;
}

/** Historial de rondas desiertas archivadas de un lote (`GET .../rounds`) -- vacío en
 * un lote que nunca fue reincorporado. */
export async function fetchLoteRoundsRequest(remateId: string, loteId: string): Promise<LoteRound[]> {
  const { data } = await apiClient.get<LoteRound[]>(`/remates/${remateId}/lotes/${loteId}/rounds`);
  return data;
}

/**
 * Acciones del rematador sobre el timer de un lote (Épica 8, "cuenta regresiva y
 * cierre automático", `backend/app/timer/router.py`) -- consumidas por
 * `ConsolaControlPanel`. Mismo criterio que `openLoteRequest`/`closeLoteRequest`:
 * exigen lote `open` con un timer en curso (422 si no).
 */
export async function pauseLoteTimerRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/timer/pause`);
  return data;
}

export async function resumeLoteTimerRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/timer/resume`);
  return data;
}

export async function resetLoteTimerRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/timer/reset`);
  return data;
}

export async function setLoteTimerRemainingRequest(
  remateId: string,
  loteId: string,
  seconds: number,
): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/timer/remaining`, {
    seconds,
  });
  return data;
}

export async function setLoteTimerAutoCloseRequest(
  remateId: string,
  loteId: string,
  enabled: boolean,
): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/timer/auto-close`, {
    enabled,
  });
  return data;
}

/**
 * CRUD y reordenamiento de `Lote` (Épica 2, Módulo 2.2, `backend/app/modules/remates/
 * lotes/router.py`) -- consumido por la Gestión de Remates y Lotes (Épica 5, Módulo
 * 5.3). Las cuatro requieren que el remate padre esté `draft`/`scheduled`
 * (`LoteService._assert_structure_editable`, 422 en cualquier otro estado) -- una vez
 * `live`, la estructura de lotes queda congelada (RF-05/RF-07).
 */
export async function createLoteRequest(remateId: string, payload: LoteFormPayload): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes`, payload);
  return data;
}

export async function updateLoteRequest(
  remateId: string,
  loteId: string,
  payload: LoteFormPayload,
): Promise<Lote> {
  const { data } = await apiClient.patch<Lote>(`/remates/${remateId}/lotes/${loteId}`, payload);
  return data;
}

export async function deleteLoteRequest(remateId: string, loteId: string): Promise<void> {
  await apiClient.delete(`/remates/${remateId}/lotes/${loteId}`);
}

/** `POST /remates/{id}/lotes/reorder` -- exige la lista COMPLETA y ordenada de ids de
 * lotes vigentes del remate (ni de más ni de menos, `LoteService.reorder`); devuelve
 * todos los lotes ya con su `display_order` actualizado. */
export async function reorderLotesRequest(remateId: string, loteIds: string[]): Promise<Lote[]> {
  const { data } = await apiClient.post<Lote[]>(`/remates/${remateId}/lotes/reorder`, {
    lote_ids: loteIds,
  });
  return data;
}

/**
 * Gestión multimedia de lotes (Épica 6, Módulo 6.1, ver docs/32-gestion-multimedia-
 * lotes.md y ADR-035). Dos operaciones separadas a propósito:
 *
 * - `uploadLoteImageRequest` sube el ARCHIVO (`POST .../lotes/{id}/images`, endpoint
 *   nuevo de este módulo) y devuelve solo la URL resultante -- no toca el lote.
 * - `updateLoteImagesRequest` persiste el array `images` completo (con esa URL ya
 *   incluida, más orden/caption) usando el `PATCH` de Lote que ya existía desde la
 *   Épica 2.2 (`LoteUpdate.images`), sin necesidad de mandar el resto de los campos del
 *   lote -- el backend acepta un `PATCH` parcial.
 *
 * `LoteGalleryManager` sube todos los archivos elegidos en paralelo y recién arma UN
 * único `PATCH` con el array final, para no perder entradas si dos requests de
 * actualización llegaran a superponerse (ver docs/32, "Flujo de carga de archivos").
 */
export async function uploadLoteImageRequest(
  remateId: string,
  loteId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ url: string }>(
    `/remates/${remateId}/lotes/${loteId}/images`,
    formData,
    {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );
  return data;
}

export async function updateLoteImagesRequest(
  remateId: string,
  loteId: string,
  images: LoteImage[],
): Promise<Lote> {
  const { data } = await apiClient.patch<Lote>(`/remates/${remateId}/lotes/${loteId}`, { images });
  return data;
}
