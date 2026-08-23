/**
 * Llamadas HTTP de la pestaña "Usuarios" del panel de administrador (RF-03) --
 * `GET /users` y `PATCH /users/{id}/status`, ambos ya existían en el backend desde antes
 * de que hubiera ninguna pantalla que los llamara (`app/modules/users/router.py`).
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type { User } from '../auth/types';

export async function fetchUsersRequest(
  page: number,
  pageSize: number,
  pendingOnly: boolean,
): Promise<Page<User>> {
  const { data } = await apiClient.get<Page<User>>('/users', {
    params: { page: String(page), page_size: String(pageSize), pending_only: String(pendingOnly) },
  });
  return data;
}

export async function updateUserStatusRequest(userId: string, isActive: boolean): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${userId}/status`, { is_active: isActive });
  return data;
}
