import type { TimelineEntry } from './types';

/**
 * Todas las entradas del timeline que traen una observación (`note_added`, o un
 * `status_changed` con nota adjunta) -- `PostAuctionCase.notes` solo guarda el texto de
 * la última observación; el historial completo de observaciones vive en el timeline, que
 * ya viaja entero en `PostAuctionCaseDetail.timeline`, sin pedir nada nuevo al backend.
 * Orden: más reciente primero (para feeds tipo "Observaciones del rematador").
 */
export function findNoteEntries(timeline: TimelineEntry[]): TimelineEntry[] {
  return timeline
    .filter((entry) => Boolean(entry.note))
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

/** Entrada más reciente del timeline que trae una observación -- ver `findNoteEntries`. */
export function findLastNoteEntry(timeline: TimelineEntry[]): TimelineEntry | null {
  return findNoteEntries(timeline)[0] ?? null;
}
