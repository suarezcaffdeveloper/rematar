/**
 * Lógica pura de "Ventas adjudicadas" de la empresa: en qué punto está cada venta, cuánto
 * hace que está ahí, si está atrasada, qué sigue y qué cosas necesitan que la empresa haga
 * algo. Sin JSX ni estado, para testearla en aislamiento -- las páginas y los componentes de
 * `components/sales/` solo la presentan.
 *
 * Importante sobre el "tiempo en este estado": la lista (`PostAuctionCase`) no trae el
 * timeline, así que ahí se calcula con las fechas hito del caso (`contacted_at`,
 * `payment_at`, ...) y, donde no hay hito (o se saltó un paso), con `updated_at` -- una
 * aproximación. El detalle sí tiene el timeline y usa la fecha exacta del último cambio de
 * estado (`stateSince` con `timeline`).
 */

import { formatCompactMoney } from '../rematador/dashboard';
import { STATUS_ORDER } from './labels';
import type { PostAuctionCase, PostAuctionStatus, TimelineEntry } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** La plata de las ventas se muestra siempre en pesos: hoy ningún campo del caso trae moneda. */
export const SALES_CURRENCY = 'ARS';

export type SalesFilter = 'all' | 'coordinar' | 'pago' | 'camino' | 'cerradas' | 'late';

export const STAGE_GROUPS: Array<{ id: Exclude<SalesFilter, 'all' | 'late'>; label: string; statuses: PostAuctionStatus[] }> = [
  { id: 'coordinar', label: 'Por coordinar', statuses: ['adjudicado', 'pendiente_contacto'] },
  { id: 'pago', label: 'Esperando el pago', statuses: ['pago_pendiente'] },
  { id: 'camino', label: 'En camino', statuses: ['pago_recibido', 'preparando_entrega', 'enviado'] },
  { id: 'cerradas', label: 'Cerradas', statuses: ['entregado', 'finalizado'] },
];

export const SALES_FILTERS: Array<{ value: SalesFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  ...STAGE_GROUPS.map((group) => ({ value: group.id as SalesFilter, label: group.label })),
  { value: 'late', label: 'Atrasadas' },
];

export interface NextAction {
  label: string;
  hint: string;
}

/** Qué sigue en cada estado (la acción guiada). `finalizado` no tiene: es el último. */
export const NEXT_ACTIONS: Partial<Record<PostAuctionStatus, NextAction>> = {
  adjudicado: { label: 'Empezar el contacto', hint: 'Pasá la venta a “Pendiente de contacto” cuando estés por hablar con el comprador.' },
  pendiente_contacto: { label: 'Registrar contacto hecho', hint: 'Ya hablaste con el comprador. La venta queda esperando el pago.' },
  pago_pendiente: { label: 'Registrar pago recibido', hint: 'Confirmaste que el pago llegó. Subí el comprobante en Documentación.' },
  pago_recibido: { label: 'Empezar a preparar la entrega', hint: 'Arrancás con el retiro o el envío del lote.' },
  preparando_entrega: { label: 'Marcar como enviada', hint: 'El lote salió hacia el comprador o ya fue retirado.' },
  enviado: { label: 'Confirmar entrega', hint: 'El comprador ya recibió el lote.' },
  entregado: { label: 'Cerrar la venta', hint: 'Todo está resuelto: pago, entrega y documentación.' },
};

/** Título del aviso que recibe el comprador al llegar a ese estado (espejo de
 * `PostAuctionService._notify_status_change`, backend). */
export function buyerNotificationTitle(status: PostAuctionStatus): string {
  if (status === 'pago_recibido') return 'Pago registrado';
  if (status === 'entregado') return 'Entrega confirmada';
  return 'Actualización de tu compra';
}

export function statusIndex(status: PostAuctionStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function nextStatus(status: PostAuctionStatus): PostAuctionStatus | null {
  return STATUS_ORDER[statusIndex(status) + 1] ?? null;
}

/** Estados que se saltean al pasar de `from` a `to` (los de en medio). */
export function skippedStatuses(from: PostAuctionStatus, to: PostAuctionStatus): PostAuctionStatus[] {
  return STATUS_ORDER.slice(statusIndex(from) + 1, statusIndex(to));
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

const MILESTONE_BY_STATUS: Partial<Record<PostAuctionStatus, keyof PostAuctionCase>> = {
  pago_pendiente: 'contacted_at',
  pago_recibido: 'payment_at',
  enviado: 'shipped_at',
  entregado: 'delivered_at',
  finalizado: 'finalized_at',
};

/** Desde cuándo está la venta en su estado actual (ms). Con `timeline` es exacto: la fecha
 * del último cambio de estado (o del alta). Sin él, se aproxima con la fecha hito del estado
 * y, si no hay, con `updated_at`. */
export function stateSince(item: PostAuctionCase, timeline?: TimelineEntry[]): number {
  if (timeline && timeline.length > 0) {
    const last = [...timeline]
      .filter((entry) => entry.action === 'status_changed' || entry.action === 'case_created')
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];
    const exact = parse(last?.occurred_at);
    if (exact !== null) return exact;
  }
  if (item.status === 'adjudicado') return parse(item.created_at) ?? Date.now();
  const milestoneField = MILESTONE_BY_STATUS[item.status];
  const milestone = milestoneField ? parse(item[milestoneField] as string | null) : null;
  return milestone ?? parse(item.updated_at) ?? parse(item.created_at) ?? Date.now();
}

export function daysInState(item: PostAuctionCase, now: number, timeline?: TimelineEntry[]): number {
  return Math.max(0, Math.floor((now - stateSince(item, timeline)) / DAY_MS));
}

export function describeDays(days: number): string {
  if (days === 0) return 'hoy';
  return days === 1 ? '1 día' : `${days} días`;
}

/** Cuántos días puede estar una venta en cada estado antes de considerarse atrasada, y cómo
 * se llama el problema. Umbrales de producto (no vienen del backend). */
const LATE_RULES: Partial<Record<PostAuctionStatus, { days: number; problem: string }>> = {
  adjudicado: { days: 2, problem: 'Sin contactar' },
  pendiente_contacto: { days: 2, problem: 'Contacto pendiente' },
  pago_pendiente: { days: 5, problem: 'Pago pendiente' },
  pago_recibido: { days: 2, problem: 'Falta preparar la entrega' },
  preparando_entrega: { days: 3, problem: 'Entrega sin enviar' },
  enviado: { days: 7, problem: 'Enviada sin confirmar entrega' },
  entregado: { days: 5, problem: 'Entregada sin cerrar' },
};

/** "Pago pendiente hace 6 días", o `null` si la venta está dentro de lo normal. */
export function describeLate(item: PostAuctionCase, now: number, timeline?: TimelineEntry[]): string | null {
  const rule = LATE_RULES[item.status];
  if (!rule) return null;
  const days = daysInState(item, now, timeline);
  return days > rule.days ? `${rule.problem} hace ${days} días` : null;
}

export function isLate(item: PostAuctionCase, now: number): boolean {
  return describeLate(item, now) !== null;
}

function amount(item: PostAuctionCase): number {
  return Number(item.final_price) || 0;
}

export interface SalesTotals {
  unpaidCount: number;
  unpaidSum: number;
  lateCount: number;
  lateSum: number;
  wayCount: number;
  waySum: number;
  paid30Count: number;
  paid30Sum: number;
  byStage: Array<{ status: PostAuctionStatus; count: number; sum: number }>;
}

/** Totales del tablero. "Sin cobrar" son las ventas que todavía no llegaron a "Pago recibido";
 * "cobrado en 30 días", las que tienen fecha de pago dentro de ese período (una venta que
 * saltó el paso de pago no tiene esa fecha y no se cuenta). */
export function computeTotals(items: PostAuctionCase[], now: number): SalesTotals {
  const sum = (list: PostAuctionCase[]) => list.reduce((acc, item) => acc + amount(item), 0);
  const unpaid = items.filter((item) => statusIndex(item.status) <= 2);
  const late = items.filter((item) => isLate(item, now));
  const way = items.filter((item) => statusIndex(item.status) >= 3 && statusIndex(item.status) <= 5);
  const paid30 = items.filter((item) => {
    const paidAt = parse(item.payment_at);
    return statusIndex(item.status) >= 3 && paidAt !== null && now - paidAt <= 30 * DAY_MS;
  });
  return {
    unpaidCount: unpaid.length,
    unpaidSum: sum(unpaid),
    lateCount: late.length,
    lateSum: sum(late),
    wayCount: way.length,
    waySum: sum(way),
    paid30Count: paid30.length,
    paid30Sum: sum(paid30),
    byStage: STATUS_ORDER.map((status) => {
      const list = items.filter((item) => item.status === status);
      return { status, count: list.length, sum: sum(list) };
    }),
  };
}

export type SalesTaskSeverity = 'urgent' | 'warn' | 'todo';

export interface SalesTask {
  id: string;
  severity: SalesTaskSeverity;
  item: PostAuctionCase;
  title: string;
  description: string;
}

const SEVERITY_ORDER: Record<SalesTaskSeverity, number> = { urgent: 0, warn: 1, todo: 2 };

/** Lo que necesita que la empresa haga algo, ordenado por urgencia y, a igual urgencia, por
 * el que más tiempo lleva esperando. */
export function buildSalesTasks(items: PostAuctionCase[], now: number): SalesTask[] {
  const tasks: Array<SalesTask & { weight: number }> = [];
  for (const item of items) {
    if (item.status === 'finalizado') continue;
    const index = statusIndex(item.status);
    const late = describeLate(item, now);
    const buyer = item.buyer_name ?? 'el comprador';
    const days = daysInState(item, now);
    const next = NEXT_ACTIONS[item.status];

    if (index <= 2 && late) {
      tasks.push({
        id: `late-${item.id}`,
        severity: 'urgent',
        item,
        title: index === 2 ? `${buyer} todavía no pagó` : `Falta contactar a ${buyer}`,
        description: `${late}. ${formatCompactMoney(amount(item), SALES_CURRENCY)} esperando.`,
        weight: -days,
      });
    } else if (index >= 3 && late) {
      tasks.push({
        id: `late-${item.id}`,
        severity: 'warn',
        item,
        title: `${item.lote_title}: ${late.charAt(0).toLowerCase()}${late.slice(1)}`,
        description: `Para ${buyer}. ${next?.hint ?? ''}`.trim(),
        weight: 100 - days,
      });
    } else if (item.status === 'adjudicado') {
      tasks.push({
        id: `new-${item.id}`,
        severity: 'todo',
        item,
        title: `Nueva venta: ${item.lote_title}`,
        description: `Se adjudicó a ${buyer} por ${formatCompactMoney(amount(item), SALES_CURRENCY)}. Empezá el contacto.`,
        weight: 200,
      });
    } else if (item.status === 'pago_recibido') {
      tasks.push({
        id: `paid-${item.id}`,
        severity: 'todo',
        item,
        title: `Pago recibido de ${buyer}`,
        description: 'Pasá a preparar la entrega y subí el comprobante si falta.',
        weight: 210,
      });
    } else if (item.status === 'entregado') {
      tasks.push({
        id: `delivered-${item.id}`,
        severity: 'todo',
        item,
        title: `${item.lote_title} ya fue entregado`,
        description: 'Si está todo resuelto, cerrá la venta.',
        weight: 220,
      });
    }
  }
  return tasks
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.weight - b.weight)
    .map(({ weight: _weight, ...task }) => task);
}

/** Titular de la pantalla: cuánto hay por cobrar y cuántas cosas esperan. */
export function buildSalesHeadline(totals: SalesTotals, taskCount: number): string {
  const first =
    totals.unpaidCount > 0
      ? `Tenés ${formatCompactMoney(totals.unpaidSum, SALES_CURRENCY)} por cobrar`
      : 'No tenés cobros pendientes';
  if (taskCount === 0) return `${first}. Todo al día.`;
  return `${first} y ${taskCount} ${taskCount === 1 ? 'cosa' : 'cosas'} para resolver.`;
}

export function matchesFilter(item: PostAuctionCase, filter: SalesFilter, now: number): boolean {
  if (filter === 'all') return true;
  if (filter === 'late') return isLate(item, now);
  return STAGE_GROUPS.find((group) => group.id === filter)?.statuses.includes(item.status) ?? false;
}

export function filterSales(items: PostAuctionCase[], filter: SalesFilter, query: string, now: number): PostAuctionCase[] {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesFilter(item, filter, now)) return false;
    if (!normalized) return true;
    return (
      item.lote_title.toLowerCase().includes(normalized) ||
      item.lot_number.toLowerCase().includes(normalized) ||
      (item.buyer_name ?? '').toLowerCase().includes(normalized)
    );
  });
}

/** Orden de la galería: las atrasadas primero (las que más tiempo llevan, antes) y las
 * cerradas al final. */
export function sortSales(items: PostAuctionCase[], now: number): PostAuctionCase[] {
  return [...items].sort((a, b) => {
    const lateDiff = Number(isLate(b, now)) - Number(isLate(a, now));
    if (lateDiff !== 0) return lateDiff;
    const closedDiff = Number(a.status === 'finalizado') - Number(b.status === 'finalizado');
    if (closedDiff !== 0) return closedDiff;
    return daysInState(b, now) - daysInState(a, now);
  });
}

/** Fecha en la que la venta llegó a `status` según el timeline, `null` si no pasó por ahí
 * (se saltó). El primer estado, `adjudicado`, se fecha con el alta del caso. */
export function dateReached(status: PostAuctionStatus, timeline: TimelineEntry[], createdAt: string): string | null {
  const entry = [...timeline]
    .filter((e) => e.action === 'status_changed' && e.new_status === status)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];
  if (entry) return entry.occurred_at;
  if (status === 'adjudicado') return timeline.find((e) => e.action === 'case_created')?.occurred_at ?? createdAt;
  return null;
}
