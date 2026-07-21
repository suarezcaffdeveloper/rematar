/**
 * Formateo de fechas -- `Intl.DateTimeFormat` nativo, sin agregar una dependencia
 * (date-fns/dayjs) solo para esto (ver ADR-027, "mantener el árbol de dependencias
 * chico" como criterio ya usado para Axios/Zustand/Tailwind).
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `"15 jul 2026, 18:30"` a partir de un ISO 8601 (`starts_at`/`ends_at` del backend). */
export function formatDateTime(iso: string): string {
  return DATE_TIME_FORMATTER.format(new Date(iso));
}

const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

/** `"18:30"` a partir de un ISO 8601 -- para la hora de un mensaje de chat (Épica 6,
 * Módulo 6.4), donde la fecha completa de `formatDateTime` sería ruido. */
export function formatTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Formatea un monto -- `amount` llega como `string` (Pydantic serializa `Decimal` así
 * para no perder precisión, ver `features/remates/types.ts::Lote`), nunca `number`.
 * `currency` es `Remate.settings.currency` (ISO 4217 de 3 letras, ej. "ARS", "USD").
 *
 * `Intl.NumberFormat` tira `RangeError` si el código de moneda no es válido para el
 * runtime del navegador -- improbable dado que `RemateSettings.currency` ya se valida
 * en el backend (`_normalize_currency`, `remates/schemas.py`), pero un dato corrupto o
 * un runtime con soporte de `Intl` incompleto no debería romper toda la pantalla por un
 * precio mal formateado.
 */
export function formatCurrency(amount: string, currency: string): string {
  try {
    let formatter = currencyFormatterCache.get(currency);
    if (!formatter) {
      formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency });
      currencyFormatterCache.set(currency, formatter);
    }
    return formatter.format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * `"1h 23m"`/`"5m 02s"`/`"00:45"` a partir de una duración en milisegundos -- para el
 * "tiempo transcurrido" de la Consola Operativa del Rematador (Épica 5, Módulo 5.2).
 * Sin `Intl.DurationFormat` (soporte de navegador todavía desparejo en 2026) ni una
 * librería nueva (mismo criterio que el resto de `format.ts`, ver ADR-027) -- aritmética
 * simple alcanza para un cronómetro de horas/minutos/segundos.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
