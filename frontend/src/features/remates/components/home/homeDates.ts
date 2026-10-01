import type { Remate } from '../../types';

const weekdayShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const dateShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const hourFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

export const DAYS_AHEAD = 7;

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Hoy y los `DAYS_AHEAD - 1` días siguientes. */
export function upcomingDays(): Date[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Día en el que "cae" un remate para el filtro por día: uno en vivo cuenta como hoy (el
 * `starts_at` puede ser de un día anterior), el resto por su fecha de inicio. `null` si
 * todavía no tiene fecha. */
export function remateDay(remate: Remate): Date | null {
  if (remate.status === 'live') return new Date();
  return remate.starts_at ? new Date(remate.starts_at) : null;
}

export const formatWeekdayShort = (d: Date) => weekdayShort.format(d).replace('.', '');

/** `"vie 2 oct 18:00 h"` -- fecha corta + hora de inicio de un remate programado. */
export function formatSchedule(iso: string): string {
  const d = new Date(iso);
  return `${dateShort.format(d).replace(/[.,]/g, '')} ${hourFormatter.format(d)} h`;
}
