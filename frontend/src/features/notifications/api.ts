/**
 * Llamadas HTTP del feature de Notificaciones (Épica 9, Etapa 3) -- primer consumidor de
 * frontend del Notification Service, que existe en el backend desde la Épica 7.5
 * (`app/notifications/router.py`) sin haber sido usado todavía desde acá.
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type { Notification, UnreadCount } from './types';

export async function fetchNotificationsRequest(
  page: number,
  pageSize: number,
  unreadOnly = false,
): Promise<Page<Notification>> {
  const { data } = await apiClient.get<Page<Notification>>('/notifications', {
    params: { page, page_size: pageSize, unread_only: unreadOnly },
  });
  return data;
}

export async function fetchUnreadNotificationCountRequest(): Promise<UnreadCount> {
  const { data } = await apiClient.get<UnreadCount>('/notifications/no-leidas/conteo');
  return data;
}

export async function markNotificationReadRequest(notificationId: string): Promise<Notification> {
  const { data } = await apiClient.patch<Notification>(`/notifications/${notificationId}/leer`);
  return data;
}

export async function markAllNotificationsReadRequest(): Promise<void> {
  await apiClient.post('/notifications/leer-todas');
}
