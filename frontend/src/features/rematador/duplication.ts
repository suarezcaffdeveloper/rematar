/**
 * "Duplicar remate"/"Duplicar lote" (Épica 5, Módulo 5.3) -- ninguno de los dos existe
 * como endpoint en el backend (confirmado revisando `remates/router.py` y
 * `lotes/router.py`: no hay `POST .../duplicate`). Se implementan del lado del cliente
 * componiendo los endpoints de lectura/creación ya existentes -- "todas las acciones
 * deberán consumir los endpoints existentes" se cumple leyendo con `GET` y creando con
 * `POST`, en vez de inventar un endpoint nuevo.
 */

import { createLoteRequest, createRemateRequest, fetchLotesRequest } from '../remates/api';
import type { Lote, LoteFormPayload, Remate, RemateFormPayload } from '../remates/types';

/** Tope de `page_size` que acepta `GET /remates/{id}/lotes`
 * (`Query(default=20, ge=1, le=100)`, `backend/app/modules/remates/lotes/router.py`). */
const DUPLICATE_LOTES_PAGE_SIZE = 100;
const LOT_NUMBER_MAX_LENGTH = 20;

/** Trae todos los lotes de un remate, paginando mientras haga falta -- la mayoría de los
 * remates de este dominio entran en una sola página, pero un remate con más de 100 lotes
 * no debe perder ninguno silenciosamente. */
async function fetchAllLotes(remateId: string): Promise<Lote[]> {
  const lotes: Lote[] = [];
  let page = 1;
  while (true) {
    const { items, total } = await fetchLotesRequest(remateId, { page, page_size: DUPLICATE_LOTES_PAGE_SIZE });
    lotes.push(...items);
    if (lotes.length >= total || items.length === 0) break;
    page += 1;
  }
  return lotes;
}

function loteToPayload(lote: Lote): LoteFormPayload {
  return {
    lot_number: lote.lot_number,
    title: lote.title,
    category: lote.category,
    description: lote.description,
    attributes: lote.attributes,
    images: lote.images,
    quantity: lote.quantity,
    unit_label: lote.unit_label,
    base_price: lote.base_price,
    min_increment: lote.min_increment,
    reserve_price: lote.reserve_price,
  };
}

/**
 * Crea un remate nuevo (`DRAFT`) con los mismos datos descriptivos que `source`, más una
 * copia de todos sus lotes vigentes, en el mismo orden. Deliberadamente **no** copia
 * `starts_at`/`ends_at`: una copia no debería heredar la fecha exacta de otro remate (el
 * rematador programa el nuevo cuando corresponda) -- nace como cualquier remate nuevo,
 * sin fecha.
 *
 * Si falla a mitad de camino (por ejemplo, al crear el tercer lote de diez), el remate
 * nuevo y los lotes ya creados **quedan** -- no hay rollback automático. Es un
 * `DRAFT` recién creado, así que el rematador puede simplemente revisarlo, completar lo
 * que falte, o eliminarlo (`DELETE` solo permitido en `DRAFT`, siempre disponible acá).
 */
export async function duplicateRemate(source: Remate): Promise<Remate> {
  const payload: RemateFormPayload = {
    title: `${source.title} (copia)`,
    category: source.category,
    description: source.description,
    cover_image_url: source.cover_image_url,
    location: source.location,
    starts_at: null,
    ends_at: null,
    settings: source.settings,
  };
  const newRemate = await createRemateRequest(payload);

  const lotes = await fetchAllLotes(source.id);
  for (const lote of lotes) {
    await createLoteRequest(newRemate.id, loteToPayload(lote));
  }

  return newRemate;
}

/** Sufija `lot_number` para no chocar con la restricción de unicidad por remate
 * (`uq_lotes_remate_id_lot_number`) -- si ya existe "1-copia", prueba "1-copia-2", etc.
 * Trunca a los 20 caracteres que exige `LoteCreate.lot_number` (edge case de números de
 * lote ya muy largos; aceptado, no se persigue la unicidad perfecta en ese caso límite). */
function generateUniqueLotNumber(baseLotNumber: string, existingLotNumbers: string[]): string {
  const existing = new Set(existingLotNumbers);
  let suffix = 1;
  let candidate = `${baseLotNumber}-copia`.slice(0, LOT_NUMBER_MAX_LENGTH);
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseLotNumber}-copia-${suffix}`.slice(0, LOT_NUMBER_MAX_LENGTH);
  }
  return candidate;
}

/** Crea una copia de `source` en el mismo remate, al final del orden de exhibición (el
 * backend asigna `display_order` automáticamente en `create`, sin necesidad de
 * reordenar después). */
export async function duplicateLote(
  remateId: string,
  source: Lote,
  existingLotNumbers: string[],
): Promise<Lote> {
  const payload: LoteFormPayload = {
    ...loteToPayload(source),
    lot_number: generateUniqueLotNumber(source.lot_number, existingLotNumbers),
    title: `${source.title} (copia)`,
  };
  return createLoteRequest(remateId, payload);
}
