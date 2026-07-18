/**
 * Valores, validación y mapeo del formulario de Lote (Épica 5, Módulo 5.3) -- un único
 * formulario reutilizable para crear y editar (`LoteFormModal`), reflejando las mismas
 * reglas que `backend/app/modules/remates/lotes/schemas.py::LoteCreate`/`LoteUpdate`.
 *
 * "Peso" tiene su propio campo dedicado (pedido explícito del enunciado, separado de
 * "información técnica") aunque el backend no lo modela como columna propia -- vive como
 * `attributes.peso_kg`, un atributo más entre los libres. El editor de "información
 * técnica" (`attributeRows`) excluye `peso_kg` a propósito para no editarlo dos veces en
 * dos lugares distintos del mismo formulario.
 */

import type { Lote, LoteAttributeValue, LoteFormPayload, RemateCategory } from '../remates/types';

export interface AttributeRow {
  key: string;
  value: string;
}

export interface LoteFormValues {
  lot_number: string;
  title: string;
  category: RemateCategory | '';
  description: string;
  peso_kg: string;
  attributeRows: AttributeRow[];
  quantity: string;
  unit_label: string;
  base_price: string;
  min_increment: string;
  reserve_price: string;
  image_url: string;
}

export const DEFAULT_LOTE_FORM_VALUES: LoteFormValues = {
  lot_number: '',
  title: '',
  category: '',
  description: '',
  peso_kg: '',
  attributeRows: [],
  quantity: '1',
  unit_label: '',
  base_price: '',
  min_increment: '',
  reserve_price: '',
  image_url: '',
};

export type LoteFormErrors = Partial<
  Record<'lot_number' | 'title' | 'category' | 'description' | 'peso_kg' | 'quantity' | 'unit_label' | 'base_price' | 'min_increment' | 'reserve_price' | 'image_url' | 'attributes', string>
>;

const MAX_ATTRIBUTES = 30;
const MAX_ATTRIBUTE_KEY_LENGTH = 100;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPositiveDecimal(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}

export function loteToFormValues(lote: Lote): LoteFormValues {
  const { peso_kg, ...otherAttributes } = lote.attributes;
  return {
    lot_number: lote.lot_number,
    title: lote.title,
    category: lote.category,
    description: lote.description ?? '',
    peso_kg: peso_kg !== undefined ? String(peso_kg) : '',
    attributeRows: Object.entries(otherAttributes).map(([key, value]) => ({ key, value: String(value) })),
    quantity: String(lote.quantity),
    unit_label: lote.unit_label ?? '',
    base_price: lote.base_price,
    min_increment: lote.min_increment,
    reserve_price: lote.reserve_price ?? '',
    image_url: lote.images[0]?.url ?? '',
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
  if (values.peso_kg.trim() && !isPositiveDecimal(values.peso_kg)) {
    errors.peso_kg = 'Ingresá un peso válido, mayor a 0.';
  }
  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = 'La cantidad debe ser un entero mayor o igual a 1.';
  }
  if (values.unit_label.length > 50) {
    errors.unit_label = 'La unidad no puede superar los 50 caracteres.';
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
  if (values.image_url.trim() && !isValidUrl(values.image_url.trim())) {
    errors.image_url = 'Ingresá una URL válida (por ejemplo, https://...).';
  }

  const nonEmptyRows = values.attributeRows.filter((row) => row.key.trim());
  const totalAttributes = nonEmptyRows.length + (values.peso_kg.trim() ? 1 : 0);
  if (totalAttributes > MAX_ATTRIBUTES) {
    errors.attributes = `No se permiten más de ${MAX_ATTRIBUTES} atributos.`;
  } else if (nonEmptyRows.some((row) => row.key.trim().length > MAX_ATTRIBUTE_KEY_LENGTH)) {
    errors.attributes = `Las claves de atributos no pueden superar los ${MAX_ATTRIBUTE_KEY_LENGTH} caracteres.`;
  } else {
    const keys = nonEmptyRows.map((row) => row.key.trim().toLowerCase());
    if (new Set(keys).size !== keys.length) {
      errors.attributes = 'Hay claves de atributos repetidas.';
    }
  }

  return errors;
}

/** Intenta preservar el tipo del valor tal como lo haría alguien completando un
 * `<input>` genérico: si es un número válido, se guarda como número (coincide con cómo
 * ya viene, por ejemplo, `peso_kg: 480` en vez de `"480"`); si no, se guarda como texto.
 * No reconoce booleanos desde texto libre ("true"/"false") -- una simplificación
 * deliberada, ese caso no surgió en ningún dato real hasta ahora. */
function coerceAttributeValue(rawValue: string): LoteAttributeValue {
  const trimmed = rawValue.trim();
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
    return Number(trimmed);
  }
  return trimmed;
}

export function buildLoteFormPayload(values: LoteFormValues): LoteFormPayload {
  const attributes: Record<string, LoteAttributeValue> = {};
  if (values.peso_kg.trim()) {
    attributes.peso_kg = coerceAttributeValue(values.peso_kg);
  }
  for (const row of values.attributeRows) {
    const key = row.key.trim();
    if (key) attributes[key] = coerceAttributeValue(row.value);
  }

  const imageUrl = values.image_url.trim();

  return {
    lot_number: values.lot_number.trim(),
    title: values.title.trim(),
    category: values.category as RemateCategory,
    description: values.description.trim() || null,
    attributes,
    images: imageUrl ? [{ url: imageUrl, order: 0, caption: null }] : [],
    quantity: Number(values.quantity),
    unit_label: values.unit_label.trim() || null,
    base_price: values.base_price.trim(),
    min_increment: values.min_increment.trim(),
    reserve_price: values.reserve_price.trim() || null,
  };
}
