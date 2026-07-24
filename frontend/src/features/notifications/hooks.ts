import { useCallback, useState } from 'react';
import { useAsyncResource, type UseAsyncResourceResult } from '../../shared/hooks/useAsyncResource';
import type { Page } from '../../shared/api/types';
import {
  fetchNotificationsRequest,
  fetchUnreadNotificationCountRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from './api';
import type { Notification } from './types';

export interface UseNotificationsResult extends UseAsyncResourceResult<Page<Notification> | null> {
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

/** Últimas notificaciones del usuario actual -- una única página, sin paginación real
 * todavía (ni el dropdown del header ni la tarjeta del dashboard la necesitan: ambos
 * muestran solo "lo más reciente"). `markAsRead`/`markAllAsRead` recargan la lista
 * después de escribir, mismo patrón que el resto de la app (sin actualización
 * optimista: son acciones de bajo riesgo, un recargo es información suficiente). */
export function useNotifications(pageSize: number): UseNotificationsResult {
  const [reloadToken, setReloadToken] = useState(0);
  const result = useAsyncResource<Page<Notification> | null>(
    () => fetchNotificationsRequest(1, pageSize),
    [pageSize, reloadToken],
    null,
  );

  const markAsRead = useCallback(async (notificationId: string) => {
    await markNotificationReadRequest(notificationId);
    setReloadToken((token) => token + 1);
  }, []);

  const markAllAsRead = useCallback(async () => {
    await markAllNotificationsReadRequest();
    setReloadToken((token) => token + 1);
  }, []);

  return { ...result, markAsRead, markAllAsRead };
}

export interface UseUnreadNotificationCountResult {
  unreadCount: number;
  reload: () => void;
}

/** Conteo de no leídas -- separado de `useNotifications` porque el badge del header
 * necesita el total real, no solo cuántas de las últimas N están sin leer. */
export function useUnreadNotificationCount(): UseUnreadNotificationCountResult {
  const { data, reload } = useAsyncResource(
    () => fetchUnreadNotificationCountRequest(),
    [],
    { unread_count: 0 },
  );

  return { unreadCount: data.unread_count, reload };
}
