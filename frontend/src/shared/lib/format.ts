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

const COMPACT_DATE_PART_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const COMPACT_TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * `"11 ago 2026 · 17:30"` a partir de un ISO 8601 -- variante compacta de
 * `formatDateTime` (Épica 7, `FinishedRemateCard`): sin los "de" que agrega el patrón
 * largo de `es-AR` entre día/mes/año, y en 24hs en vez de "05:30 p. m." (más corto, sin
 * ambigüedad am/pm) para que quepa junto al resto de metadatos de una tarjeta.
 */
export function formatDateTimeCompact(iso: string): string {
  const date = new Date(iso);
  const dateOnly = COMPACT_DATE_PART_FORMATTER.formatToParts(date)
    .filter((part) => part.type === 'day' || part.type === 'month' || part.type === 'year')
    .map((part) => part.value)
    .join(' ');
  return `${dateOnly} · ${COMPACT_TIME_FORMATTER.format(date)}`;
}

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Formatea un monto -- `amount` llega como `string` (Pydantic serializa `Decimal` así
 * para no perder precisión, ver `features/remates/types.ts::Lote`), nunca `number`.
 * `currency` es `Remate.settings.currency` (ISO 4217 de 3 letras, ej. "ARS", "USD").
 *
 * Sin decimales (pedido explícito): los montos de este dominio (remates de hacienda)
 * siempre son montos redondos, los centavos son ruido visual. `maximumFractionDigits: 0`
 * redondea en vez de truncar -- no importa porque `amount` en la práctica ya llega sin
 * parte decimal significativa.
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
      formatter = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
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

/** `"340 KB"`/`"2.4 MB"` a partir de un tamaño en bytes -- documentos adjuntos de una
 * venta adjudicada (Épica 7, Módulo 7.5). Sin decimales por debajo de 1 MB (los KB de un
 * PDF/imagen chica no aportan precisión útil), un decimal a partir de ahí. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
