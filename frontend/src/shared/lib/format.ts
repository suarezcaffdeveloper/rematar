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
