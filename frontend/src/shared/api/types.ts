/**
 * Formas genéricas de la API, compartidas por cualquier feature — reflejan
 * exactamente `app/common/schemas.py` y `app/core/exceptions.py` del backend.
 * No hay generación automática de tipos desde el OpenAPI del backend todavía (ver
 * docs/24-fundacion-frontend.md, "Trabajo futuro"): estos tipos se mantienen a mano,
 * en un único lugar, para que un cambio de forma en el backend sea fácil de propagar.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** `{"error": {"code": ..., "message": ..., "details": ...}}` — app/core/exceptions.py */
export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

/** Envelope de paginación estándar — `app/common/schemas.py::Page`. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
