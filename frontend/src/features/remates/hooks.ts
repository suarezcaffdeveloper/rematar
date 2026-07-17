/**
 * Hooks del feature de remates -- orquestan `api.ts` y exponen estado de
 * carga/error/datos a los componentes, mismo rol que `features/auth/store.ts` cumple
 * para auth (acá no hace falta un store global de Zustand: el dashboard es la única
 * pantalla que necesita esta data hoy, y no se comparte entre rutas).
 */

import { useCallback, useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import {
  fetchLoteCountRequest,
  fetchLotesRequest,
  fetchRemateByIdRequest,
  fetchRematesRequest,
} from './api';
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

/** Trae TODAS las páginas de `GET /remates` visibles para el usuario actual (hasta el tope). */
export function useRemates(): UseRematesResult {
  const [remates, setRemates] = useState<Remate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const collected: Remate[] = [];
        let page = 1;
        while (collected.length < MAX_REMATES) {
          const result = await fetchRematesRequest({ page, page_size: PAGE_SIZE });
          collected.push(...result.items);
          const gotFullPage = result.items.length === PAGE_SIZE;
          const moreRemain = collected.length < result.total;
          if (!gotFullPage || !moreRemain) break;
          page += 1;
        }
        if (!cancelled) setRemates(collected);
      } catch (err) {
        if (!cancelled) setError(normalizeApiError(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

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
  const [remate, setRemate] = useState<Remate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchRemateByIdRequest(remateId)
      .then((result) => {
        if (!cancelled) setRemate(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { remate, isLoading, error, reload };
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
export function useLotes(remateId: string): UseLotesResult {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
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
        if (!cancelled) {
          setLotes(collected);
          setTotal(runningTotal);
        }
      } catch (err) {
        if (!cancelled) setError(normalizeApiError(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [remateId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { lotes, total, isLoading, error, reload };
}
