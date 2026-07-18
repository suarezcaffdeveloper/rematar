/**
 * Wrapper tipado sobre `import.meta.env` — ningún otro archivo del proyecto debe leer
 * `import.meta.env` directamente. Dos razones:
 *
 * 1. Falla rápido: si falta una variable requerida, el error aparece al importar este
 *    módulo (arranque de la app), no en el primer request que la necesite — mismo
 *    criterio que ya usa `Settings` en el backend (`app/core/config.py`).
 * 2. Un único lugar navegable para saber qué variables de entorno existen (RNF-17).
 *
 * Vite solo expone al cliente las variables prefijadas `VITE_` (por diseño: evita que
 * un secreto de servidor termine embebido en el bundle por accidente).
 */

function readRequiredEnvVar(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno "${key}". Copiá .env.example a .env y completala.`,
    );
  }
  return value;
}

/**
 * `wsBaseUrl` -- derivada de `apiBaseUrl`, no una variable de entorno propia: el
 * Gateway WebSocket (Épica 3, Módulo 3.3) vive en el mismo host/puerto que la API HTTP,
 * bajo el mismo prefijo de versión (`/api/v1/ws`, ver `docs/20-gateway-websocket.md`) --
 * agregar una segunda variable de entorno para esto sería una fuente de verdad
 * duplicada que podría desincronizarse de `VITE_API_BASE_URL` en algún entorno.
 */
export function deriveWsBaseUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/^http/, 'ws')}/ws`;
}

export const env = {
  apiBaseUrl: readRequiredEnvVar('VITE_API_BASE_URL'),
  get wsBaseUrl() {
    return deriveWsBaseUrl(this.apiBaseUrl);
  },
} as const;
