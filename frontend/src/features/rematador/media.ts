/**
 * Validación de imágenes de lote (Épica 6, Módulo 6.1) -- espeja las mismas reglas que
 * `backend/app/modules/remates/lotes/media_storage.py` (Content-Type y tamaño máximo),
 * para rechazar un archivo inválido antes de gastar una subida entera: mejor experiencia
 * (feedback inmediato) que esperar el 422 del servidor, pero el backend vuelve a validar
 * igual -- este chequeo es una optimización de UX, no la única barrera real.
 */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Devuelve un mensaje de error si `file` no es válido, o `null` si puede subirse. */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" no es un formato admitido. Usá JPG, PNG o WEBP.`;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const maxMb = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
    return `"${file.name}" supera el tamaño máximo permitido (${maxMb} MB).`;
  }
  return null;
}
