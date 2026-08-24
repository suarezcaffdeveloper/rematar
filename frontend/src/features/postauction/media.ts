/**
 * Validación de documentos adjuntos a una venta adjudicada (Épica 7, Módulo 7.5 --
 * continuación) -- espeja las mismas reglas que `backend/app/postauction/media_storage.py`
 * (Content-Type y tamaño máximo), mismo criterio ya usado por
 * `features/rematador/media.ts` para imágenes de lote: feedback inmediato antes de gastar
 * una subida entera, el backend vuelve a validar igual.
 */

export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Devuelve un mensaje de error si `file` no es válido, o `null` si puede subirse. */
export function validateDocumentFile(file: File): string | null {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return `"${file.name}" no es un formato admitido. Usá PDF, JPG, PNG o WEBP.`;
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    const maxMb = MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024);
    return `"${file.name}" supera el tamaño máximo permitido (${maxMb} MB).`;
  }
  return null;
}
