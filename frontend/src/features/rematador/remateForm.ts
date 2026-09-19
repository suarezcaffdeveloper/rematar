/**
 * Valores, validación y mapeo del formulario de Remate (Épica 5, Módulo 5.3) -- un único
 * formulario reutilizable para crear y editar (`RemateFormModal`), reflejando las mismas
 * reglas que `backend/app/modules/remates/schemas.py::RemateCreate`/`RemateUpdate`
 * validan del lado del servidor. Funciones puras, sin JSX ni estado -- testeables en
 * aislamiento.
 */

import type {
  Remate,
  RemateAccessType,
  RemateAuctionType,
  RemateCategory,
  RemateFormPayload,
} from '../remates/types';

export interface RemateFormValues {
  title: string;
  category: RemateCategory | '';
  description: string;
  cover_image_url: string;
  location: string;
  /** Elegible solo al crear -- `RemateFormModal` no muestra este campo en modo edición,
   * así que en ese modo siempre viaja de vuelta con el mismo valor que ya tenía el
   * remate (el backend lo ignora en un `PATCH` de todas formas). */
  access_type: RemateAccessType;
  /** Modalidad del remate -- igual que `access_type`, elegible solo al crear. Determina
   * qué bloque de campos de abajo (LIVE o TIMED) es el que realmente aplica; ver
   * `validateRemateForm`/`buildRemateFormPayload`. */
  auction_type: RemateAuctionType;
  /** Formato de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, hora local, sin
   * zona horaria) -- nunca un ISO 8601 con `Z`. Opcionales en LIVE; ambos obligatorios
   * en TIMED (definen el período general de puja de todos los lotes). */
  starts_at: string;
  ends_at: string;
  currency: string;
  anti_sniping_enabled: boolean;
  /** LIVE únicamente -- un solo valor sirve de ventana y de duración. */
  anti_sniping_extension_seconds: string;
  /** Cuenta regresiva por lote (Épica 8, ADR-043) -- `null` en `RemateSettings` es "sin
   * timer", mismo patrón opt-in que `anti_sniping_enabled`. LIVE únicamente: en TIMED el
   * deadline de cada lote es `ends_at`, no un timer por lote independiente. */
  lote_timer_enabled: boolean;
  lote_timer_seconds: string;
  /** TIMED únicamente -- ventana de disparo y duración de la extensión anti-sniping
   * como valores independientes (a diferencia de LIVE, arriba). Ambos obligatorios si
   * `anti_sniping_enabled` está activo. */
  timed_extension_window_seconds: string;
  timed_extension_duration_seconds: string;
  /** Garantía económica (bloqueo de tarjeta vía Mercado Pago) -- aplica a ambas
   * modalidades por igual, a diferencia de los bloques de arriba. */
  guarantee_required: boolean;
  guarantee_amount: string;
}

export const DEFAULT_REMATE_FORM_VALUES: RemateFormValues = {
  title: '',
  category: '',
  description: '',
  cover_image_url: '',
  location: '',
  access_type: 'public',
  auction_type: 'live',
  starts_at: '',
  ends_at: '',
  currency: 'ARS',
  anti_sniping_enabled: false,
  anti_sniping_extension_seconds: '60',
  lote_timer_enabled: false,
  lote_timer_seconds: '60',
  timed_extension_window_seconds: '60',
  timed_extension_duration_seconds: '120',
  guarantee_required: false,
  guarantee_amount: '',
};

export type RemateFormErrors = Partial<Record<keyof RemateFormValues, string>>;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** `Date` -> `"YYYY-MM-DDTHH:mm"` en hora LOCAL (no `toISOString()`, que da UTC) -- el
 * formato que espera un `<input type="datetime-local">`. */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Un `<input type="datetime-local">` sin zona horaria explícita ya se interpreta como
 * hora LOCAL por el propio constructor de `Date` -- `.toISOString()` hace la conversión
 * a UTC correcta a partir de ahí, sin ningún cálculo manual de offset. */
function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function remateToFormValues(remate: Remate): RemateFormValues {
  return {
    title: remate.title,
    category: remate.category,
    description: remate.description ?? '',
    cover_image_url: remate.cover_image_url ?? '',
    location: remate.location ?? '',
    access_type: remate.access_type ?? 'public',
    auction_type: remate.auction_type ?? 'live',
    starts_at: remate.starts_at ? toDatetimeLocalValue(remate.starts_at) : '',
    ends_at: remate.ends_at ? toDatetimeLocalValue(remate.ends_at) : '',
    currency: remate.settings.currency,
    anti_sniping_enabled:
      remate.auction_type === 'timed' ? remate.settings.anti_sniping_enabled : false,
    anti_sniping_extension_seconds: String(remate.settings.anti_sniping_extension_seconds),
    lote_timer_enabled: false,
    lote_timer_seconds:
      remate.settings.lote_timer_seconds !== null
        ? String(remate.settings.lote_timer_seconds)
        : DEFAULT_REMATE_FORM_VALUES.lote_timer_seconds,
    timed_extension_window_seconds:
      remate.settings.timed_extension_window_seconds !== null &&
      remate.settings.timed_extension_window_seconds !== undefined
        ? String(remate.settings.timed_extension_window_seconds)
        : DEFAULT_REMATE_FORM_VALUES.timed_extension_window_seconds,
    timed_extension_duration_seconds:
      remate.settings.timed_extension_duration_seconds !== null &&
      remate.settings.timed_extension_duration_seconds !== undefined
        ? String(remate.settings.timed_extension_duration_seconds)
        : DEFAULT_REMATE_FORM_VALUES.timed_extension_duration_seconds,
    guarantee_required: remate.settings.guarantee_required ?? false,
    guarantee_amount: remate.settings.guarantee_amount ?? '',
  };
}

/** Mismas reglas que el backend (`RemateCreate`/`RemateUpdate`, ver docstring del
 * archivo) -- validado en el cliente para no depender de un 422 como único feedback. */
export function validateRemateForm(values: RemateFormValues): RemateFormErrors {
  const errors: RemateFormErrors = {};
  const title = values.title.trim();

  if (title.length < 3 || title.length > 200) {
    errors.title = 'El título debe tener entre 3 y 200 caracteres.';
  }
  if (!values.category) {
    errors.category = 'Elegí una categoría.';
  }
  if (values.description.length > 5000) {
    errors.description = 'La descripción no puede superar los 5000 caracteres.';
  }
  if (values.location.length > 255) {
    errors.location = 'La ubicación no puede superar los 255 caracteres.';
  }
  if (values.cover_image_url.trim() && !isValidUrl(values.cover_image_url.trim())) {
    errors.cover_image_url = 'Ingresá una URL válida (por ejemplo, https://...).';
  }
  if (values.starts_at && values.ends_at) {
    const startsAt = new Date(values.starts_at).getTime();
    const endsAt = new Date(values.ends_at).getTime();
    if (endsAt <= startsAt) {
      errors.ends_at = 'La fecha estimada de fin debe ser posterior a la de inicio.';
    }
  }
  if (!/^[A-Za-z]{3}$/.test(values.currency.trim())) {
    errors.currency = 'La moneda debe ser un código de 3 letras (por ejemplo, ARS).';
  }
  if (values.guarantee_required) {
    const amount = Number(values.guarantee_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.guarantee_amount = 'Ingresá un monto de garantía mayor a cero.';
    }
  }

  if (values.auction_type === 'timed') {
    // TIMED exige ambas fechas (a diferencia de LIVE, donde son opcionales): definen
    // el período general en el que todos los lotes aceptan ofertas en paralelo -- ver
    // `RemateCreate`/`RemateService.schedule` del lado del backend.
    if (!values.starts_at) {
      errors.starts_at = 'Un remate Timed necesita fecha y hora de inicio.';
    }
    if (!values.ends_at) {
      errors.ends_at = 'Un remate Timed necesita fecha y hora de finalización.';
    }
    if (values.anti_sniping_enabled) {
      const window = Number(values.timed_extension_window_seconds);
      if (!Number.isFinite(window) || window < 10 || window > 3600) {
        errors.timed_extension_window_seconds = 'Debe ser un número entre 10 y 3600 segundos.';
      }
      const duration = Number(values.timed_extension_duration_seconds);
      if (!Number.isFinite(duration) || duration < 10 || duration > 3600) {
        errors.timed_extension_duration_seconds = 'Debe ser un número entre 10 y 3600 segundos.';
      }
    }
  }

  return errors;
}

export function buildRemateFormPayload(values: RemateFormValues): RemateFormPayload {
  const isTimed = values.auction_type === 'timed';
  return {
    title: values.title.trim(),
    category: values.category as RemateCategory,
    description: values.description.trim() || null,
    cover_image_url: values.cover_image_url.trim() || null,
    location: values.location.trim() || null,
    access_type: values.access_type,
    auction_type: values.auction_type,
    starts_at: values.starts_at ? fromDatetimeLocalValue(values.starts_at) : null,
    ends_at: values.ends_at ? fromDatetimeLocalValue(values.ends_at) : null,
    settings: isTimed
      ? {
          currency: values.currency.trim().toUpperCase(),
          anti_sniping_enabled: values.anti_sniping_enabled,
          // No aplica a TIMED -- el backend rechaza cualquier valor no nulo acá para
          // esta modalidad (ver `RemateSettings`/validadores en schemas.py).
          lote_timer_seconds: null,
          timed_extension_window_seconds: values.anti_sniping_enabled
            ? Number(values.timed_extension_window_seconds)
            : null,
          timed_extension_duration_seconds: values.anti_sniping_enabled
            ? Number(values.timed_extension_duration_seconds)
            : null,
          guarantee_required: values.guarantee_required,
          guarantee_amount: values.guarantee_required ? values.guarantee_amount.trim() : null,
        }
      : {
          currency: values.currency.trim().toUpperCase(),
          // LIVE no tiene anti-sniping ni cuenta regresiva por lote: el martillero abre y
          // cierra cada lote a mano.
          anti_sniping_enabled: false,
          lote_timer_seconds: null,
          guarantee_required: values.guarantee_required,
          guarantee_amount: values.guarantee_required ? values.guarantee_amount.trim() : null,
        },
  };
}
