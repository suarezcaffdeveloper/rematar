/**
 * Lógica pura de la pantalla "Mis compras" del comprador: agrupar por etapa, elegir qué
 * compra va al frente, ordenar lo que está en proceso y armar las "últimas novedades" a
 * partir de las fechas de hito que ya trae cada caso. Sin React ni estado, así se testea
 * sin montar nada.
 */

import type { PostAuctionCase, PostAuctionStatus } from './types';

export type ComprasGroupId = 'coordinar' | 'pagar' | 'camino' | 'recibidas';

export const COMPRAS_GROUPS: { id: ComprasGroupId; label: string; statuses: PostAuctionStatus[] }[] = [
  { id: 'coordinar', label: 'Por coordinar', statuses: ['adjudicado', 'pendiente_contacto'] },
  { id: 'pagar', label: 'Para pagar', statuses: ['pago_pendiente'] },
  { id: 'camino', label: 'En camino', statuses: ['pago_recibido', 'preparando_entrega', 'enviado'] },
  { id: 'recibidas', label: 'Recibidas', statuses: ['entregado', 'finalizado'] },
];

export function groupOf(status: PostAuctionStatus): ComprasGroupId {
  const group = COMPRAS_GROUPS.find((g) => g.statuses.includes(status));
  // Los ocho estados están cubiertos; el fallback solo protege de un estado nuevo que el
  // backend agregue antes que el frontend.
  return group?.id ?? 'coordinar';
}

/** Estados en los que la compra ya llegó a manos del comprador. */
export const RECEIVED_STATUSES: PostAuctionStatus[] = ['entregado', 'finalizado'];

export function isInProgress(compra: Pick<PostAuctionCase, 'status'>): boolean {
  return !RECEIVED_STATUSES.includes(compra.status);
}

/** Estados que dejan a la compra "esperando algo" (del comprador o del martillero), en
 * el orden en el que van al frente. */
const FOCUS_ORDER: PostAuctionStatus[] = ['pago_pendiente', 'pendiente_contacto', 'adjudicado'];

export const FOCUS_LABELS: Partial<Record<PostAuctionStatus, string>> = {
  pago_pendiente: 'Esperando tu pago',
  pendiente_contacto: 'Esperando al martillero',
  adjudicado: 'Recién adjudicada',
};

function createdAtTime(compra: PostAuctionCase): number {
  return new Date(compra.created_at).getTime();
}

/**
 * La compra que va al frente: primero la que espera el pago del comprador, después la que
 * espera contacto, después la recién adjudicada; dentro de cada grupo, la que hace más
 * tiempo que espera. `null` si no hay ninguna de esas (todo está en camino o recibido).
 */
export function pickFocus(compras: PostAuctionCase[]): PostAuctionCase | null {
  const waiting = compras.filter((c) => FOCUS_ORDER.includes(c.status));
  if (waiting.length === 0) return null;
  return [...waiting].sort(
    (a, b) => FOCUS_ORDER.indexOf(a.status) - FOCUS_ORDER.indexOf(b.status) || createdAtTime(a) - createdAtTime(b),
  )[0];
}

/** Lo que está en proceso, con lo que espera el pago del comprador primero y después lo
 * más reciente. */
export function sortInProgress(compras: PostAuctionCase[]): PostAuctionCase[] {
  return compras
    .filter(isInProgress)
    .sort(
      (a, b) =>
        Number(b.status === 'pago_pendiente') - Number(a.status === 'pago_pendiente') ||
        createdAtTime(b) - createdAtTime(a),
    );
}

const EVENT_FIELDS: { key: keyof PostAuctionCase; text: string }[] = [
  { key: 'finalized_at', text: 'Finalizó el proceso' },
  { key: 'delivered_at', text: 'Se entregó' },
  { key: 'shipped_at', text: 'Fue enviada' },
  { key: 'payment_at', text: 'Se registró el pago' },
  { key: 'contacted_at', text: 'El martillero se contactó' },
  { key: 'created_at', text: 'Te la adjudicaron' },
];

export interface CompraEvent {
  compra: PostAuctionCase;
  /** Fecha del hito (ISO 8601). */
  at: string;
  text: string;
}

/** El hito más reciente de una compra, según sus fechas. */
export function latestEvent(compra: PostAuctionCase): CompraEvent {
  let best: CompraEvent = { compra, at: compra.created_at, text: 'Te la adjudicaron' };
  let bestTime = new Date(compra.created_at).getTime();
  for (const field of EVENT_FIELDS) {
    const value = compra[field.key] as string | null;
    if (!value) continue;
    const time = new Date(value).getTime();
    if (time > bestTime) {
      best = { compra, at: value, text: field.text };
      bestTime = time;
    }
  }
  return best;
}

/** Las novedades más recientes entre todas las compras, la más nueva primero. */
export function recentEvents(compras: PostAuctionCase[], limit: number): CompraEvent[] {
  return compras
    .map(latestEvent)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

const DAY_MS = 24 * 3600 * 1000;
const relativeFormatter = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

/** `"hoy"`, `"ayer"`, `"hace 3 días"`, `"hace 2 semanas"`, `"hace 3 meses"`. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const days = Math.max(0, Math.round((now - new Date(iso).getTime()) / DAY_MS));
  if (days < 7) return relativeFormatter.format(-days, 'day');
  if (days < 30) return relativeFormatter.format(-Math.round(days / 7), 'week');
  return relativeFormatter.format(-Math.round(days / 30), 'month');
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

/** `"27 sept"` */
export function formatShortDate(iso: string): string {
  return SHORT_DATE_FORMATTER.format(new Date(iso)).replace('.', '');
}

export function matchesComprasSearch(compra: PostAuctionCase, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  return (
    compra.lote_title.toLowerCase().includes(normalized) ||
    compra.remate_title.toLowerCase().includes(normalized) ||
    compra.lot_number.toLowerCase().includes(normalized)
  );
}
