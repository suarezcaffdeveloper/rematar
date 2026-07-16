/**
 * Manejo global de errores (Épica 4, Módulo 4.1): cualquier error de una llamada HTTP
 * -- sin importar si es de red, de validación, o de una regla de negocio del backend --
 * pasa por acá antes de llegar a un componente, y sale con la misma forma. Ningún
 * componente debería inspeccionar un `AxiosError` directamente.
 */

import { isAxiosError } from 'axios';
import type { ApiErrorEnvelope } from './types';

export interface NormalizedApiError {
  /** `null` cuando no hubo respuesta del servidor (red caída, timeout, CORS). */
  status: number | null;
  code: string;
  message: string;
  details?: unknown;
}

const NETWORK_ERROR: Omit<NormalizedApiError, 'status'> = {
  code: 'network_error',
  message: 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
};

const UNKNOWN_ERROR: NormalizedApiError = {
  status: null,
  code: 'unknown_error',
  message: 'Ocurrió un error inesperado.',
};

function hasApiErrorEnvelope(data: unknown): data is ApiErrorEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'object' &&
    (data as ApiErrorEnvelope).error !== null &&
    typeof (data as ApiErrorEnvelope).error.code === 'string' &&
    typeof (data as ApiErrorEnvelope).error.message === 'string'
  );
}

/**
 * Convierte cualquier error posible de una llamada HTTP (incluido "no es ni siquiera
 * un error de Axios") en una forma única y predecible. Nunca lanza.
 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  if (!isAxiosError(error)) {
    return UNKNOWN_ERROR;
  }

  if (!error.response) {
    return { status: null, ...NETWORK_ERROR };
  }

  const { status, data } = error.response;
  if (hasApiErrorEnvelope(data)) {
    return {
      status,
      code: data.error.code,
      message: data.error.message,
      details: data.error.details,
    };
  }

  return {
    status,
    code: 'http_error',
    message: `Error inesperado del servidor (${status}).`,
  };
}
