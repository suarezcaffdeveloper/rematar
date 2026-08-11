/**
 * Valores, validación y mapeo del formulario de Lote (Épica 5, Módulo 5.3) -- un único
 * formulario reutilizable para crear y editar (`LoteFormModal`), reflejando las mismas
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
}

export const DEFAULT_LOTE_FORM_VALUES: LoteFormValues = {
  lot_number: '',
  title: '',
  category: '',
  description: '',
  base_price: '',
  min_increment: '',
  reserve_price: '',
};

export type LoteFormErrors = Partial<
  Record<'lot_number' | 'title' | 'category' | 'description' | 'base_price' | 'min_increment' | 'reserve_price', string>
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
  };
}

/** Mismas reglas que el backend (`LoteCreate`/`LoteUpdate`, ver docstring del archivo). */
export function validateLoteForm(values: LoteFormValues): LoteFormErrors {
  const errors: LoteFormErrors = {};
  const lotNumber = values.lot_number.trim();
  const title = values.title.trim();

  if (lotNumber.length < 1 || lotNumber.length > 20) {
    errors.lot_number = 'El número de lote debe tener entre 1 y 20 caracteres.';
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
  if (!isPositiveDecimal(values.base_price)) {
    errors.base_price = 'Ingresá un precio inicial válido, mayor a 0.';
  }
  if (!isPositiveDecimal(values.min_increment)) {
    errors.min_increment = 'Ingresá un incremento mínimo válido, mayor a 0.';
  }
  if (values.reserve_price.trim()) {
    if (!isPositiveDecimal(values.reserve_price)) {
      errors.reserve_price = 'Ingresá un precio de reserva válido, mayor a 0.';
    } else if (isPositiveDecimal(values.base_price) && Number(values.reserve_price) < Number(values.base_price)) {
      errors.reserve_price = 'El precio de reserva no puede ser menor al precio inicial.';
    }
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
  };
}
