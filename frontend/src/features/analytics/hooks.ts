/**
 * Hook del feature de analítica (Épica 7, Módulo 7.1). Fetch inicial por HTTP +
 * refetch **debounced** (trailing edge, no reducer incremental) ante cualquier evento
 * de dominio relevante recibido por `subscribeToRealtime` (expuesto por
 * `useLiveRemateState`, `features/sala/hooks.ts`) -- ver ADR-038, sección D, para por
 * qué: varias métricas (tasa en ventana, promedio, conteo filtrado por rol, "top N")
 * no son una función pura de `(valor previo, un evento)` sin arriesgar deriva
 * acumulada en una sesión larga; un número ~1.2s viejo es preferible a uno que puede
 * desincronizarse en silencio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import { fetchRemateAnalyticsRequest } from './api';
import { isAnalyticsTriggerMessage } from './realtime/events';
import type { RemateAnalyticsSnapshot } from './types';

/** Ventana de debounce (trailing edge) -- una ráfaga de eventos durante una guerra de
 * ofertas colapsa en un único refetch, no uno por evento. */
const DEBOUNCE_MS = 1200;

export interface UseRemateAnalyticsResult {
  data: RemateAnalyticsSnapshot | null;
  /** Solo describe el PRIMER fetch -- un refetch de fondo que falla no vuelve a poner
   * esto en `true` (ver `initialError`). */
  isInitialLoading: boolean;
  /** Únicamente el primer fetch puede setear esto -- un refetch de fondo que falla se
   * descarta en silencio, manteniendo el último dato bueno en pantalla (mismo criterio
   * de "mejor esfuerzo" que `useChatMessages.loadOlder`). El panel (`AnalyticsPanel`)
   * es quien decide qué hacer con este error; nunca se propaga a la página. */
  initialError: NormalizedApiError | null;
}

export function useRemateAnalytics(
  remateId: string,
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void,
): UseRemateAnalyticsResult {
  const [data, setData] = useState<RemateAnalyticsSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<NormalizedApiError | null>(null);

  const hasLoadedOnceRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNow = useCallback((id: string) => {
    fetchRemateAnalyticsRequest(id)
      .then((snapshot) => {
        setData(snapshot);
        setInitialError(null);
      })
      .catch((err) => {
        if (!hasLoadedOnceRef.current) {
          setInitialError(normalizeApiError(err));
        }
      })
      .finally(() => {
        hasLoadedOnceRef.current = true;
        setIsInitialLoading(false);
      });
  }, []);

  // --- Fetch inicial, uno nuevo por remateId ------------------------------------------

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setData(null);
    setIsInitialLoading(true);
    setInitialError(null);
    if (!remateId) return;
    fetchNow(remateId);
  }, [remateId, fetchNow]);

  // --- Refetch debounced ante eventos relevantes --------------------------------------

  useEffect(() => {
    if (!remateId) return;
    const unsubscribe = subscribeToRealtime((message) => {
      if (!isAnalyticsTriggerMessage(message)) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        fetchNow(remateId);
      }, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [remateId, subscribeToRealtime, fetchNow]);

  return { data, isInitialLoading, initialError };
}
