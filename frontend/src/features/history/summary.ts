/**
 * Lógica pura del Historial de la empresa: período, filtro por estado, orden, titular y
 * totales de la lista, y las frases en lenguaje simple del resumen de un remate. Sin JSX ni
 * estado, para testearla en aislamiento -- las páginas y los componentes solo la presentan.
 *
 * Todo el filtrado de la lista es del lado del cliente sobre la lista completa
 * (`useAllFinishedRemates`): el backend solo filtra por fechas y por texto, no por estado
 * (finalizado/cancelado), y el período del tablero ("últimos 30 días") se resuelve igual
 * con `resolved_at`.
 */

import { formatCompactMoney } from '../rematador/dashboard';
import type { Lote } from '../remates/types';
import type { FinishedRemateSummary, LoteHistoryDetail } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** El resumen del backend no trae moneda: la lista siempre muestra pesos. */
export const HISTORY_CURRENCY = 'ARS';

export type HistoryPeriod = '30' | '90' | 'all';

export const HISTORY_PERIODS: Array<{ value: HistoryPeriod; label: string; days: number; phrase: string }> = [
  { value: '30', label: 'Últimos 30 días', days: 30, phrase: 'En los últimos 30 días' },
  { value: '90', label: 'Últimos 90 días', days: 90, phrase: 'En los últimos 90 días' },
  { value: 'all', label: 'Todo el historial', days: Infinity, phrase: 'En todo tu historial' },
];

export type HistoryStatusFilter = 'all' | 'finished' | 'cancelled';
export type HistorySort = 'recent' | 'amount' | 'name';

export const HISTORY_SORTS: Array<{ value: HistorySort; label: string }> = [
  { value: 'recent', label: 'Más recientes primero' },
  { value: 'amount', label: 'Los que más vendieron' },
  { value: 'name', label: 'Por nombre (A-Z)' },
];

export function isCancelled(item: FinishedRemateSummary): boolean {
  return item.status === 'cancelled';
}

function resolvedTime(item: FinishedRemateSummary): number {
  const time = item.resolved_at ? new Date(item.resolved_at).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

export function inPeriod(item: FinishedRemateSummary, period: HistoryPeriod, now: number): boolean {
  const days = HISTORY_PERIODS.find((p) => p.value === period)?.days ?? Infinity;
  if (!Number.isFinite(days)) return true;
  return now - resolvedTime(item) <= days * DAY_MS;
}

export function matchesStatus(item: FinishedRemateSummary, status: HistoryStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'cancelled' ? isCancelled(item) : !isCancelled(item);
}

function amount(item: FinishedRemateSummary): number {
  return Number(item.total_awarded_value) || 0;
}

export function filterAndSortHistory(
  items: FinishedRemateSummary[],
  { period, status, query, sort }: { period: HistoryPeriod; status: HistoryStatusFilter; query: string; sort: HistorySort },
  now: number,
): FinishedRemateSummary[] {
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter(
    (item) => inPeriod(item, period, now) && matchesStatus(item, status) && (!normalized || item.title.toLowerCase().includes(normalized)),
  );
  return filtered.sort((a, b) => {
    if (sort === 'amount') return amount(b) - amount(a);
    if (sort === 'name') return a.title.localeCompare(b.title, 'es');
    return resolvedTime(b) - resolvedTime(a);
  });
}

export interface HistoryTotals {
  finishedCount: number;
  cancelledCount: number;
  soldSum: number;
  lotesSold: number;
  lotesTotal: number;
  soldPercent: number | null;
}

/** Totales del período: lo vendido y los lotes cuentan solo remates finalizados (un remate
 * cancelado no vendió nada). */
export function computeHistoryTotals(items: FinishedRemateSummary[]): HistoryTotals {
  const finished = items.filter((item) => !isCancelled(item));
  const lotesTotal = finished.reduce((acc, item) => acc + item.lote_count, 0);
  const lotesSold = finished.reduce((acc, item) => acc + item.lotes_sold_count, 0);
  return {
    finishedCount: finished.length,
    cancelledCount: items.length - finished.length,
    soldSum: finished.reduce((acc, item) => acc + amount(item), 0),
    lotesSold,
    lotesTotal,
    soldPercent: lotesTotal > 0 ? Math.round((lotesSold / lotesTotal) * 100) : null,
  };
}

/** "En los últimos 90 días cerraste 5 remates y vendiste $354,3 M." */
export function buildHistoryHeadline(period: HistoryPeriod, totals: HistoryTotals): string {
  const phrase = HISTORY_PERIODS.find((p) => p.value === period)?.phrase ?? '';
  if (totals.finishedCount === 0 && totals.cancelledCount === 0) return `${phrase} no hay remates cerrados.`;
  if (totals.finishedCount === 0) {
    return `${phrase} se ${totals.cancelledCount === 1 ? 'canceló 1 remate' : `cancelaron ${totals.cancelledCount} remates`}.`;
  }
  return `${phrase} cerraste ${totals.finishedCount} ${totals.finishedCount === 1 ? 'remate' : 'remates'} y vendiste ${formatCompactMoney(totals.soldSum, HISTORY_CURRENCY)}.`;
}

/** "12 min 5 s", "1 h 05 min", "3 días" -- con unidad siempre (un "12:05" no se entiende). */
export function formatDurationLong(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  if (total >= 2 * 24 * 3600) return `${Math.round(total / 86400)} días`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${rest} s`;
}

export interface RemateSentenceInput {
  status: 'finished' | 'cancelled' | string;
  lotesSold: number;
  lotesTotal: number;
  totalSold: string;
  /** Porcentaje sobre el precio base de los lotes vendidos, `null` si no se puede calcular. */
  differencePercentage: number | null;
  cancelledOn?: string | null;
}

/** La frase que resume el remate. Devuelve partes para poder resaltar lo importante. */
export function buildRemateSentence(input: RemateSentenceInput): Array<{ text: string; strong?: boolean }> {
  if (input.status === 'cancelled') {
    return [{ text: `Este remate se canceló${input.cancelledOn ? ` el ${input.cancelledOn}` : ''}, antes de que se vendiera ningún lote.` }];
  }
  if (input.lotesSold === 0) {
    return [{ text: `Este remate terminó sin ventas: ${input.lotesTotal === 1 ? 'el lote quedó' : `los ${input.lotesTotal} lotes quedaron`} sin vender.` }];
  }
  const money = formatCompactMoney(Number(input.totalSold) || 0, HISTORY_CURRENCY);
  const parts: Array<{ text: string; strong?: boolean }> = [
    { text: `Vendiste ${input.lotesSold} de ${input.lotesTotal} lotes por ${money}`, strong: true },
  ];
  const pct = input.differencePercentage;
  if (pct === null) parts.push({ text: '.' });
  else if (Math.round(pct) > 0) parts.push({ text: ', un ' }, { text: `${Math.round(pct)}% más`, strong: true }, { text: ' que el precio base.' });
  else if (Math.round(pct) < 0) parts.push({ text: `, un ${Math.abs(Math.round(pct))}% menos que el precio base.` });
  else parts.push({ text: ', justo al precio base.' });
  return parts;
}

export interface UnsoldBreakdown {
  total: number;
  /** `null` si todavía no se sabe cuántas ofertas tuvo cada lote (el dato llega aparte). */
  withoutOffers: number | null;
}

/** Lotes que no se vendieron, y cuántos de ellos ni siquiera recibieron ofertas. */
export function describeUnsold(lotes: Lote[], offerResults: Map<string, LoteHistoryDetail | null>): UnsoldBreakdown {
  const unsold = lotes.filter((lote) => lote.status === 'closed_unsold');
  const known = unsold.every((lote) => offerResults.get(lote.id)?.offer_count !== undefined);
  return {
    total: unsold.length,
    withoutOffers: known ? unsold.filter((lote) => offerResults.get(lote.id)?.offer_count === 0).length : null,
  };
}

export function describeUnsoldText(breakdown: UnsoldBreakdown): string {
  if (breakdown.total === 0) return 'Se vendieron todos';
  if (breakdown.withoutOffers === null) return breakdown.total === 1 ? 'Un lote no se vendió' : 'No se vendieron';
  const withOffers = breakdown.total - breakdown.withoutOffers;
  const parts: string[] = [];
  if (breakdown.withoutOffers > 0) parts.push(`${breakdown.withoutOffers} sin ofertas`);
  if (withOffers > 0) parts.push(`${withOffers} con ofertas que no cerraron`);
  return parts.join(' y ');
}

/** Cuánto subió un lote vendido sobre su precio base, en porcentaje entero; `null` si no se vendió. */
export function risePercent(lote: Lote): number | null {
  if (lote.final_price === null || lote.final_price === undefined) return null;
  const base = Number(lote.base_price);
  const final = Number(lote.final_price);
  if (!(base > 0) || !Number.isFinite(final)) return null;
  return Math.round(((final - base) / base) * 100);
}
