/**
 * Llamadas HTTP de "Mi perfil" -- mismo patrón que `features/remates/api.ts`
 * (`uploadRemateCoverImageRequest`): la subida de imagen y el `PATCH` que la asigna son
 * dos pasos separados, ver `backend/app/modules/users/router.py`.
 */

import { apiClient } from '../../shared/api/client';
import type { User } from '../auth/types';

export async function uploadUserAvatarRequest(file: File, onProgress?: (percent: number) => void): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ url: string }>('/users/me/avatar', formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function updateUserAvatarRequest(avatarUrl: string | null): Promise<User> {
  const { data } = await apiClient.patch<User>('/users/me', { avatar_url: avatarUrl });
  return data;
}
