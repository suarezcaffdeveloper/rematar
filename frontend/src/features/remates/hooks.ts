/**
 * Hooks del feature de remates -- orquestan `api.ts` y exponen estado de
 * carga/error/datos a los componentes, mismo rol que `features/auth/store.ts` cumple
 * para auth (acá no hace falta un store global de Zustand: el dashboard es la única
 * pantalla que necesita esta data hoy, y no se comparte entre rutas).
 */

import { useEffect, useState } from 'react';
import type { NormalizedApiError } from '../../shared/api/errors';
import { useAsyncResource } from '../../shared/hooks/useAsyncResource';
import {
  fetchConnectedUsersCountRequest,
  fetchLoteByIdRequest,
  fetchLoteCountRequest,
  fetchLotesRequest,
  fetchMyPrivateAccessGrantsRequest,
  fetchRemateByIdRequest,
  fetchRematesRequest,
} from './api';
import { pickLoteCoverImages } from './collage';
import type { Lote, Remate } from './types';

const PAGE_SIZE = 100;
// Tope de remates a traer client-side. No hay búsqueda de texto en el backend (ver
// filtering.ts), así que este módulo necesita la lista completa para filtrar/ordenar en
// el cliente -- 500 es un margen amplio para el volumen esperado de un MVP; si algún día
// se supera, la solución es agregar búsqueda server-side, no subir este número.
const MAX_REMATES = 500;

export interface UseRematesResult {
  remates: Remate[];
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

export interface UseRematesParams {
  /** `owner_id` de `GET /remates` (Épica 5, Módulo 5.1) -- filtra a los remates propios
   * de ese usuario en cualquier estado, incluido `draft` (el propio dueño siempre los ve,
   * `RemateService.list_for_viewer`). Sin esto, `CompradorDashboardPage` sigue trayendo
   * exactamente lo mismo que traía antes (todo lo visible para el usuario actual, sin
   * filtrar por dueño) -- parámetro opcional, retrocompatible. */
  ownerId?: string;
  /** `rematador_id` de `GET /remates` (panel "mi remate actual" del rol `rematador`,
   * Fase 1) -- filtra al remate donde ese usuario es el operador asignado
   * (`Remate.rematador_id`), en cualquier estado no borrador (mismo criterio que
   * `ownerId`: el propio operador asignado siempre lo ve, `RemateService._is_visible`). */
  rematadorId?: string;
}

/** Trae TODAS las páginas de `GET /remates` visibles para el usuario actual (hasta el
 * tope), opcionalmente acotadas a un `owner_id`/`rematador_id` puntual. */
async function fetchAllRemates(
  ownerId: string | undefined,
  rematadorId: string | undefined,
): Promise<Remate[]> {
  const collected: Remate[] = [];
  let page = 1;
  while (collected.length < MAX_REMATES) {
    const result = await fetchRematesRequest({
      page,
      page_size: PAGE_SIZE,
      owner_id: ownerId,
      rematador_id: rematadorId,
    });
    collected.push(...result.items);
    const gotFullPage = result.items.length === PAGE_SIZE;
    const moreRemain = collected.length < result.total;
    if (!gotFullPage || !moreRemain) break;
    page += 1;
  }
  return collected;
}

export function useRemates(params: UseRematesParams = {}): UseRematesResult {
  const { ownerId, rematadorId } = params;
  const {
    data: remates,
    isLoading,
    error,
    reload,
  } = useAsyncResource<Remate[]>(
    () => fetchAllRemates(ownerId, rematadorId),
    [ownerId, rematadorId],
    [],
  );

  return { remates, isLoading, error, reload };
}

/**
 * Cantidad de lotes de un remate puntual, cargada de forma perezosa por tarjeta (ver
 * `api.ts::fetchLoteCountRequest` sobre por qué es una request aparte). `null` mientras
 * carga o si falló -- la tarjeta lo trata igual en ambos casos (ver `RemateCard.tsx`):
 * no vale la pena bloquear ni romper el resto de la tarjeta por este dato secundario.
 */
export function useLoteCount(remateId: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCount(null);
    fetchLoteCountRequest(remateId)
      .then((total) => {
        if (!cancelled) setCount(total);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId]);

  return count;
}

/**
 * Cuántos usuarios están conectados a la sala de un remate puntual en este momento --
 * mismo patrón que `useLoteCount` (perezoso, `null` mientras carga o si falló, sin
 * bloquear el resto de la tarjeta por este dato secundario). Un solo snapshot HTTP, no
 * un WebSocket: se usa para un número de referencia en una tarjeta, no para mantenerlo
 * en vivo (eso es lo que hace `useLiveRemateState` en `features/sala`).
 */
export function useConnectedUsersCount(remateId: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!remateId) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setCount(null);
    fetchConnectedUsersCountRequest(remateId)
      .then((total) => {
        if (!cancelled) setCount(total);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId]);

  return count;
}

const COVER_IMAGES_LIMIT = 4;
// Un poco más que COVER_IMAGES_LIMIT: alcanza para juntar 4 imágenes incluso si algunos
// de los primeros lotes todavía no tienen fotos cargadas, sin traer los 300 lotes que
// trae useLotes -- esta es una portada de tarjeta, no la pantalla de administración.
const COVER_IMAGES_SAMPLE_SIZE = 12;

/**
 * Portada de respaldo de un remate sin `cover_image_url` propio: la primera imagen de
 * hasta 4 lotes (`pickLoteCoverImages`), para `LotesCollagePlaceholder`. Mismo patrón
 * perezoso que `useLoteCount` -- una request aparte por tarjeta (`page_size` chico),
 * `null` mientras carga o si falló, sin bloquear el resto de la tarjeta por este dato
 * secundario. Pensado para tarjetas que, a diferencia de `RemateDetailOverview`, no
 * tienen ya los lotes cargados en memoria.
 */
export function useLoteCoverImages(remateId: string): string[] | null {
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    fetchLotesRequest(remateId, { page: 1, page_size: COVER_IMAGES_SAMPLE_SIZE })
      .then((result) => {
        if (!cancelled) setImages(pickLoteCoverImages(result.items, COVER_IMAGES_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setImages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId]);

  return images;
}

export interface UseRemateDetailResult {
  remate: Remate | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Detalle de un remate puntual (Épica 4, Módulo 4.4 -- `RemateDetailPage`). Un 404 del
 * backend (remate inexistente o no visible para este usuario, ver `api.ts`) llega acá
 * como cualquier otro error normalizado -- la página lo muestra con el mismo `Alert`
 * que un error de red, con el mensaje que ya trae el backend ("Remate no encontrado."). */
export function useRemateDetail(remateId: string): UseRemateDetailResult {
  const {
    data: remate,
    isLoading,
    error,
    reload,
  } = useAsyncResource<Remate | null>(() => fetchRemateByIdRequest(remateId), [remateId], null);

  return { remate, isLoading, error, reload };
}

export interface UseMyPrivateAccessGrantsResult {
  remates: Remate[];
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Remates privados ya canjeados por el usuario actual (`RedeemPrivateAccessPage`) --
 * mismo patrón que `useRemateDetail`, sin params porque el backend ya filtra por el
 * usuario autenticado (`GET /remates/private/mine`). */
export function useMyPrivateAccessGrants(): UseMyPrivateAccessGrantsResult {
  const {
    data: remates,
    isLoading,
    error,
    reload,
  } = useAsyncResource<Remate[]>(() => fetchMyPrivateAccessGrantsRequest(), [], []);

  return { remates, isLoading, error, reload };
}

const LOTES_PAGE_SIZE = 100;
// Mismo criterio que MAX_REMATES en useRemates: tope defensivo, no un límite de negocio.
const MAX_LOTES = 300;

export interface UseLotesResult {
  lotes: Lote[];
  total: number;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Todos los lotes de un remate, ya en el orden de exhibición (`display_order`, el mismo
 * que devuelve el backend -- ver `lotes/repository.py`). Mismo patrón de "traer todo
 * hasta un tope" que `useRemates`: la cantidad de lotes de un remate es chica en la
 * práctica, así que no hace falta paginar la UI, solo el pedido al backend. */
interface LotesPage {
  lotes: Lote[];
  total: number;
}

async function fetchAllLotes(remateId: string): Promise<LotesPage> {
  const collected: Lote[] = [];
  let page = 1;
  let runningTotal = 0;
  while (collected.length < MAX_LOTES) {
    const result = await fetchLotesRequest(remateId, { page, page_size: LOTES_PAGE_SIZE });
    collected.push(...result.items);
    runningTotal = result.total;
    const gotFullPage = result.items.length === LOTES_PAGE_SIZE;
    const moreRemain = collected.length < result.total;
    if (!gotFullPage || !moreRemain) break;
    page += 1;
  }
  return { lotes: collected, total: runningTotal };
}

export function useLotes(remateId: string): UseLotesResult {
  const {
    data: { lotes, total },
    isLoading,
    error,
    reload,
  } = useAsyncResource<LotesPage>(() => fetchAllLotes(remateId), [remateId], { lotes: [], total: 0 });

  return { lotes, total, isLoading, error, reload };
}

export interface UseLoteResult {
  lote: Lote | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/** Detalle completo de un lote puntual (con `images`/`description`), traído solo cuando
 * `enabled` -- pensado para overlays que abren bajo demanda (ej. `LoteInfoCard`) y no
 * deben pedir esto de entrada junto con el resto de la pantalla. */
export function useLote(remateId: string, loteId: string, enabled: boolean): UseLoteResult {
  const {
    data: lote,
    isLoading,
    error,
    reload,
  } = useAsyncResource<Lote | null>(() => fetchLoteByIdRequest(remateId, loteId), [remateId, loteId], null, {
    enabled,
  });

  return { lote, isLoading, error, reload };
}
