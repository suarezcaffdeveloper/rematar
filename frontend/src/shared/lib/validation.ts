/**
 * Validaciones de cliente reutilizables entre features -- espejan reglas del backend
 * (nunca las reemplazan, RNF-11: el servidor siempre revalida) para dar feedback
 * inmediato sin esperar el round-trip HTTP.
 */

/** Un monto en formato `"1234.56"` -- como máximo dos decimales, mayor a 0. Mismo
 * criterio que `Decimal(gt=0, decimal_places=2)` del backend (ej. `LoteCreate.base_price`,
 * `OfertaCreate.amount`). */
export function isPositiveDecimal(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}
