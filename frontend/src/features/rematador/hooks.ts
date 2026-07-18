/**
 * Hooks del Dashboard del Rematador (Épica 5, Módulo 5.1). No hay `api.ts` propio en
 * este feature: las llamadas HTTP que necesita ya viven en `features/remates/api.ts`
 * (mismo recurso `Remate`/`Lote`, mismo router del backend) y en `features/sala/api.ts`
 * (el snapshot, ver abajo) -- se reusan tal cual, mismo criterio que ya aplica
 * `features/sala/` al importar `useLotes` de `features/remates/hooks.ts`.
 */

import { useEffect, useState } from 'react';
import { formatDuration } from '../../shared/lib/format';
import { fetchLotesRequest } from '../remates/api';
import type { Lote, Remate, RemateStatus } from '../remates/types';
import { fetchRemateSnapshotRequest } from '../sala/api';

// Suficiente para encontrar el lote `open` y el próximo `pending` en la enorme mayoría
// de los remates reales sin traer las 300 lotes que sí trae `useLotes` (que no hace
// falta acá -- esta es una tarjeta de resumen, no la pantalla de administración
// completa). `total` del envelope de paginación sigue siendo exacto sin importar cuántos
// items se pidan (mismo criterio que `fetchLoteCountRequest`).
const LOTES_SAMPLE_SIZE = 50;

export interface RemateOperationalInfo {
  /** `null` mientras carga o si la request falló -- nunca bloquea el resto de la
   * tarjeta (mismo criterio que `useLoteCount`, Épica 4.3). */
  loteCount: number | null;
  activeLote: Lote | null;
  nextLote: Lote | null;
  /** `null` si el remate no está `live`/`paused` (no tiene sentido mostrar "conectados"
   * de un remate que nadie puede estar viendo en vivo) o si la request falló. */
  connectedUsers: number | null;
  isLoadingLotes: boolean;
}

/**
 * Info operativa de una tarjeta del dashboard: cantidad de lotes, lote activo/próximo, y
 * compradores conectados "si la información está disponible" (pedido explícito del
 * enunciado). Dos requests independientes, cada una con su propio fallo silencioso:
 *
 * 1. `GET /remates/{id}/lotes` -- siempre, sin importar el estado del remate (la
 *    cantidad de lotes es un dato de cualquier remate, incluso un borrador).
 * 2. `GET /remates/{id}/snapshot` -- solo si el remate está `live`/`paused`: es la única
 *    fuente de "conectados" (`RoomManager.connection_count`, en memoria del backend), y
 *    pedirla para un remate que todavía no arrancó o ya terminó siempre daría `0` sin
 *    aportar información real.
 */
export function useRemateOperationalInfo(remateId: string, status: RemateStatus): RemateOperationalInfo {
  const [loteCount, setLoteCount] = useState<number | null>(null);
  const [activeLote, setActiveLote] = useState<Lote | null>(null);
  const [nextLote, setNextLote] = useState<Lote | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<number | null>(null);
  const [isLoadingLotes, setIsLoadingLotes] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingLotes(true);
    fetchLotesRequest(remateId, { page: 1, page_size: LOTES_SAMPLE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setLoteCount(result.total);
        // Ya vienen ordenados por `display_order` ascendente (backend, sin cambios) --
        // el primero que matchee cada status es, por construcción, el correcto.
        setActiveLote(result.items.find((lote) => lote.status === 'open') ?? null);
        setNextLote(result.items.find((lote) => lote.status === 'pending') ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLoteCount(null);
        setActiveLote(null);
        setNextLote(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId]);

  useEffect(() => {
    if (status !== 'live' && status !== 'paused') {
      setConnectedUsers(null);
      return;
    }
    let cancelled = false;
    fetchRemateSnapshotRequest(remateId)
      .then((snapshot) => {
        if (!cancelled) setConnectedUsers(snapshot.connected_users);
      })
      .catch(() => {
        if (!cancelled) setConnectedUsers(null);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId, status]);

  return { loteCount, activeLote, nextLote, connectedUsers, isLoadingLotes };
}

const TICK_INTERVAL_MS = 1000;

/**
 * "Tiempo transcurrido" de la cabecera de la Consola Operativa (Épica 5, Módulo 5.2).
 * El backend no persiste un instante de "cuándo se puso en vivo" (`Remate` no tiene una
 * columna `started_at`, ver `backend/app/modules/remates/models.py`, sin cambios) --
 * usar `starts_at` (la fecha programada) como referencia es una aproximación deliberada,
 * no un cronómetro exacto desde el `start` real, documentada como tal (ver
 * docs/30-consola-operativa-rematador.md, "Limitaciones conocidas").
 *
 * - `live`/`paused`: cuenta en vivo desde `starts_at` hasta ahora (tick cada segundo).
 * - `finished`: fijo, `finished_at - starts_at` (el remate ya no corre, no hace falta
 *   ningún intervalo).
 * - cualquier otro estado (`draft`/`scheduled`/`cancelled`): `null` -- no hay "tiempo
 *   transcurrido" de una operación que no llegó a correr.
 */
export function useElapsedTime(remate: Remate | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  const isTicking = remate?.status === 'live' || remate?.status === 'paused';

  useEffect(() => {
    if (!isTicking) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isTicking]);

  if (!remate?.starts_at) return null;

  if (isTicking) {
    return formatDuration(now - new Date(remate.starts_at).getTime());
  }

  if (remate.status === 'finished' && remate.finished_at) {
    return formatDuration(new Date(remate.finished_at).getTime() - new Date(remate.starts_at).getTime());
  }

  return null;
}
