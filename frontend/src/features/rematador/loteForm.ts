/**
 * Valores, validación y mapeo del formulario de Lote (Épica 5, Módulo 5.3) -- un único
 * formulario reutilizable para crear y editar (`LoteDrawer`), reflejando las mismas
 * reglas que `backend/app/modules/remates/lotes/schemas.py::LoteCreate`/`LoteUpdate`.
 *
 * Simplificación visual (rediseño del flujo de creación de lotes): la UI ya no expone
 * "peso"/"cantidad"/"unidad" ni el editor de "información técnica" (`attributes`) -- ese
 * material era específico de remates ganaderos y RematAR debe servir para cualquier tipo
 * de remate. `attributes`/`quantity`/`unit_label` siguen existiendo en el backend
 * (`LoteCreate`/`LoteUpdate`) y en `LoteFormPayload`, pero como opcionales:
 * `buildLoteFormPayload` ya no los incluye en absoluto (quedan `undefined`, ausentes del
 * JSON enviado), así que al crear el backend aplica sus propios defaults
 * (`quantity=1`, `attributes={}`) y al editar un lote que ya tuviera esos datos cargados
 * de antes (`LoteUpdate` es un PATCH parcial basado en los campos presentes en el body),
 * guardar el resto de los campos nunca los pisa ni los borra.
 *
 * Sin `image_url`/`images` (Épica 6, Módulo 6.1): la galería de imágenes ahora se
 * gestiona aparte (`LoteGalleryManager` en edición, `LoteImageStager` en creación), con su
 * propio `PATCH` inmediato por acción -- ver docs/32-gestion-multimedia-lotes.md.
 * `buildLoteFormPayload` nunca incluye `images` en absoluto, así que guardar el resto de
 * los campos del lote nunca pisa sus imágenes.
 */

import { isPositiveDecimal } from '../../shared/lib/validation';
import type { Lote, LoteFormPayload, RemateCategory } from '../remates/types';

export interface LoteFormValues {
  lot_number: string;
  title: string;
  category: RemateCategory | '';
  description: string;
  base_price: string;
  min_increment: string;
  reserve_price: string;
  // Reencolado preautorizado (ADR-048): si la empresa lo habilita, el rematador
  // operador puede "volver a rematar" este lote con estos valores exactos si queda
  // desierto, sin tener que fijar él mismo un precio -- ver `ConsolaDesiertoLotesPanel`.
  requeue_preset_enabled: boolean;
  requeue_preset_base_price: string;
  requeue_preset_min_increment: string;
}

export const DEFAULT_LOTE_FORM_VALUES: LoteFormValues = {
  lot_number: '',
  title: '',
  category: '',
  description: '',
  base_price: '',
  min_increment: '',
  reserve_price: '',
  requeue_preset_enabled: false,
  requeue_preset_base_price: '',
  requeue_preset_min_increment: '',
};

export type LoteFormErrors = Partial<
  Record<
    | 'lot_number'
    | 'title'
    | 'category'
    | 'description'
    | 'base_price'
    | 'min_increment'
    | 'reserve_price'
    | 'requeue_preset_base_price'
    | 'requeue_preset_min_increment',
    string
  >
>;

export function loteToFormValues(lote: Lote): LoteFormValues {
  return {
    lot_number: lote.lot_number,
    title: lote.title,
    category: lote.category,
    description: lote.description ?? '',
    base_price: lote.base_price,
    min_increment: lote.min_increment,
    reserve_price: lote.reserve_price ?? '',
    requeue_preset_enabled: lote.requeue_preset_enabled ?? false,
    requeue_preset_base_price: lote.requeue_preset_base_price ?? '',
    requeue_preset_min_increment: lote.requeue_preset_min_increment ?? '',
  };
}

/** Siguiente número de lote sugerido: el mayor número entero ya usado + 1 (`7-copia` cuenta como 7; los
 * que no empiezan con un número no cuentan). Sin lotes, arranca en `1`. */
export function suggestNextLotNumber(existing: string[]): string {
  const numbers = existing
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return String((numbers.length > 0 ? Math.max(...numbers) : 0) + 1);
}

/** Máximo que admite el backend: `max_digits=14`, `decimal_places=2`. */
const MAX_PRICE = 999_999_999_999.99;

/** Error de un campo de precio (monto > 0, hasta 2 decimales, tope del backend) o `undefined` si es válido. */
function priceFieldError(raw: string, label: string): string | undefined {
  const value = raw.trim();
  if (!value) return `Ingresá ${label}.`;
  if (/^\d+\.\d{3,}$/.test(value)) return 'Usá como máximo 2 decimales.';
  if (!isPositiveDecimal(value)) return `Ingresá ${label} válido, mayor a 0.`;
  if (Number(value) > MAX_PRICE) return 'El monto es demasiado grande.';
  return undefined;
}

/** El incremento es una parte del precio inicial: nunca puede ser mayor a él. Se ignora si alguno
 * de los dos todavía no es un número válido (ese error ya se muestra en su propio campo). */
function incrementVsBaseError(base: string, increment: string): string | undefined {
  if (!isPositiveDecimal(base) || !isPositiveDecimal(increment)) return undefined;
  if (Number(increment) > Number(base)) return 'El incremento no puede ser mayor al precio inicial.';
  return undefined;
}

/**
 * Mismas reglas que el backend (`LoteCreate`/`LoteUpdate`, ver docstring del archivo).
 * `takenLotNumbers` (opcional): números de lote que otro lote del remate ya usa -- el backend
 * los rechaza con una restricción de unicidad, acá se avisa antes de enviar.
 */
export function validateLoteForm(values: LoteFormValues, takenLotNumbers: string[] = []): LoteFormErrors {
  const errors: LoteFormErrors = {};
  const lotNumber = values.lot_number.trim();
  const title = values.title.trim();

  if (lotNumber.length < 1 || lotNumber.length > 20) {
    errors.lot_number = 'El número de lote debe tener entre 1 y 20 caracteres.';
  } else if (takenLotNumbers.some((taken) => taken.trim().toLowerCase() === lotNumber.toLowerCase())) {
    errors.lot_number = `Ya existe un lote ${lotNumber}. Elegí otro número.`;
  }
  if (title.length < 3 || title.length > 200) {
    errors.title = 'El nombre debe tener entre 3 y 200 caracteres.';
  }
  if (!values.category) {
    errors.category = 'Elegí una categoría.';
  }
  if (values.description.length > 5000) {
    errors.description = 'La descripción no puede superar los 5000 caracteres.';
  }
  const priceError = priceFieldError(values.base_price, 'un precio inicial');
  if (priceError) errors.base_price = priceError;
  const incrementError =
    priceFieldError(values.min_increment, 'un incremento mínimo') ?? incrementVsBaseError(values.base_price, values.min_increment);
  if (incrementError) errors.min_increment = incrementError;
  if (values.reserve_price.trim()) {
    const reserveError = priceFieldError(values.reserve_price, 'un precio de reserva');
    if (reserveError) {
      errors.reserve_price = reserveError;
    } else if (isPositiveDecimal(values.base_price) && Number(values.reserve_price) < Number(values.base_price)) {
      errors.reserve_price = 'El precio de reserva no puede ser menor al precio inicial.';
    }
  }

  if (values.requeue_preset_enabled) {
    const presetBaseError = priceFieldError(values.requeue_preset_base_price, 'un precio inicial');
    if (presetBaseError) errors.requeue_preset_base_price = presetBaseError;
    const presetIncrementError =
      priceFieldError(values.requeue_preset_min_increment, 'un incremento mínimo') ??
      incrementVsBaseError(values.requeue_preset_base_price, values.requeue_preset_min_increment);
    if (presetIncrementError) errors.requeue_preset_min_increment = presetIncrementError;
  }

  return errors;
}

export function buildLoteFormPayload(values: LoteFormValues): LoteFormPayload {
  return {
    lot_number: values.lot_number.trim(),
    title: values.title.trim(),
    category: values.category as RemateCategory,
    description: values.description.trim() || null,
    base_price: values.base_price.trim(),
    min_increment: values.min_increment.trim(),
    reserve_price: values.reserve_price.trim() || null,
    requeue_preset_enabled: values.requeue_preset_enabled,
    requeue_preset_base_price: values.requeue_preset_enabled
      ? values.requeue_preset_base_price.trim()
      : null,
    requeue_preset_min_increment: values.requeue_preset_enabled
      ? values.requeue_preset_min_increment.trim()
      : null,
  };
}
