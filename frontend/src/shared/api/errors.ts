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

/** Mensajes en español para los errores de validación de campo más comunes de
 * `UserCreate` (`backend/app/modules/users/schemas.py`) que no tienen un
 * `field_validator`/`model_validator` propio (esos ya devuelven un mensaje en español
 * listo para mostrar, ver más abajo) -- sin esto, un error de "contraseña muy corta"
 * caía en el mensaje genérico `"Los datos enviados no son válidos."` sin decir qué
 * campo ni por qué, y el usuario no tenía forma de saber que su contraseña no llegaba
 * a los 8 caracteres mínimos. */
const FIELD_VALIDATION_MESSAGES: Record<string, Partial<Record<string, string>>> = {
  password: {
    string_too_short: 'La contraseña debe tener al menos 8 caracteres.',
    string_too_long: 'La contraseña no puede tener más de 128 caracteres.',
    missing: 'La contraseña es obligatoria.',
  },
  confirm_password: {
    string_too_short: 'La confirmación de contraseña debe tener al menos 8 caracteres.',
    string_too_long: 'La confirmación de contraseña no puede tener más de 128 caracteres.',
    missing: 'Confirmá tu contraseña.',
  },
  email: {
    missing: 'El email es obligatorio.',
    value_error: 'Ingresá un email válido.',
  },
  full_name: {
    string_too_short: 'Ingresá tu nombre completo.',
    missing: 'El nombre completo es obligatorio.',
  },
  phone: {
    string_too_short: 'Ingresá un teléfono válido.',
    missing: 'El teléfono es obligatorio.',
  },
};

/**
 * Traduce el primer error de un 422 de FastAPI (`RequestValidationError.errors()`,
 * saneado por `_serialize_validation_errors` en `app/core/exceptions.py`) a un mensaje
 * concreto en español. `null` si no lo reconoce -- en ese caso el llamador debe
 * quedarse con el mensaje genérico del backend en vez de arriesgar un texto sin
 * sentido.
 */
function describeValidationDetail(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { loc, msg, type } = detail as { loc?: unknown; msg?: unknown; type?: unknown };
  if (typeof msg !== 'string' || typeof type !== 'string') return null;

  // Los `field_validator`/`model_validator` propios de `UserCreate` (teléfono, rol,
  // "las contraseñas no coinciden") levantan un `ValueError` con un mensaje ya en
  // español -- Pydantic v2 solo le antepone "Value error, " al envolverlo.
  const customMessage = /^Value error,\s*(.+)$/s.exec(msg)?.[1];
  if (customMessage) return customMessage;

  const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
  if (typeof field !== 'string') return null;

  return FIELD_VALIDATION_MESSAGES[field]?.[type] ?? null;
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
    const { code, message, details } = data.error;
    const specificMessage =
      code === 'validation_error' && Array.isArray(details) && details.length > 0
        ? describeValidationDetail(details[0])
        : null;
    return {
      status,
      code,
      message: specificMessage ?? message,
      details,
    };
  }

  return {
    status,
    code: 'http_error',
    message: `Error inesperado del servidor (${status}).`,
  };
}
