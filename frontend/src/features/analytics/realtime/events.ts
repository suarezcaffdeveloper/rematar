/**
 * Detector de "hay que refetchear la analítica" (Épica 7, Módulo 7.1) -- a diferencia de
 * `features/chat/realtime/events.ts` (que tipa el payload completo de cada evento), acá
 * solo importa la **señal**: el hook (`hooks.ts::useRemateAnalytics`) dispara un refetch
 * debounced ante cualquier evento de dominio relevante, nunca aplica el payload como un
 * parche incremental (ver ADR-038, sección D, para por qué). El payload en sí se
 * descarta -- nunca se tipa.
 *
 * Dispara ante `remate.*`/`lote.*`/`oferta.*`/`presencia.*` (todos los eventos que
 * podrían cambiar alguna métrica) y ante `type: 'snapshot'` (la reconciliación de
 * `useLiveRemateState` tras una reconexión -- mismo criterio que ya trata ese mensaje el
 * resto de la app).
 */

const ANALYTICS_TRIGGER_PREFIXES = ['remate.', 'lote.', 'oferta.', 'presencia.'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAnalyticsTriggerMessage(message: unknown): boolean {
  if (!isRecord(message)) return false;

  if (message.type === 'snapshot') return true;

  if (message.type === 'domain_event' && typeof message.event_type === 'string') {
    return ANALYTICS_TRIGGER_PREFIXES.some((prefix) =>
      (message.event_type as string).startsWith(prefix),
    );
  }

  return false;
}
