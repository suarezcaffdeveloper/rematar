/**
 * Lógica pura del panel principal de la empresa ("Mis remates"): qué cosas necesitan su
 * atención, en qué etapa está cada remate y cuál es el próximo paso. Sin JSX ni estado
 * para poder testearla en aislamiento -- `RematadorDashboardPage` y
 * `RematadorRemateCard` solo la presentan.
 *
 * Ojo con lo que NO se puede saber desde un `Remate` solo: cuántos lotes tiene. Esa cifra
 * la trae cada tarjeta por su cuenta (`useRemateOperationalInfo`), así que las tareas de
 * acá se derivan únicamente de estado, fechas y operador -- las que dependen de los lotes
 * ("este borrador no tiene lotes") las resuelve `describeNextStep` dentro de la tarjeta.
 */

import type { Remate, RemateStatus } from '../remates/types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Un remate en vivo sin operador es urgente si arranca dentro de esta ventana. */
export const OPERATOR_URGENCY_WINDOW_MS = 48 * HOUR_MS;
/** Un Timed que cierra dentro de esta ventana merece un aviso. */
export const TIMED_CLOSING_WINDOW_MS = 3 * DAY_MS;

export type TaskSeverity = 'urgent' | 'warn' | 'todo' | 'info';

export interface DashboardTask {
  id: string;
  severity: TaskSeverity;
  title: string;
  description: string;
  actionLabel: string;
  to: string;
}

export interface PendingSales {
  count: number;
  /** Suma de `final_price` de las ventas esperando el pago, ya formateada. */
  amountLabel: string;
}

/** "en 18 h", "en 2 días", "hace 40 min" -- fecha relativa en ambas direcciones. */
export function describeTimeUntil(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  let value: string;
  if (abs < HOUR_MS) {
    value = `${Math.max(1, Math.round(abs / MINUTE_MS))} min`;
  } else if (abs < DAY_MS) {
    value = `${Math.round(abs / HOUR_MS)} h`;
  } else {
    const days = Math.round(abs / DAY_MS);
    value = `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  return diff >= 0 ? `en ${value}` : `hace ${value}`;
}

export function isTimed(remate: Remate): boolean {
  return remate.auction_type === 'timed';
}

const SEVERITY_ORDER: Record<TaskSeverity, number> = { urgent: 0, warn: 1, todo: 2, info: 3 };

/**
 * Lista priorizada de "qué hacer ahora". Orden: urgente, atención, pendiente, aviso; a
 * igual severidad, el que más pronto pasa primero.
 */
export function buildPendingTasks(remates: Remate[], now: number, pendingSales: PendingSales | null): DashboardTask[] {
  const tasks: Array<DashboardTask & { when: number }> = [];

  for (const remate of remates) {
    const startsAt = remate.starts_at ? new Date(remate.starts_at).getTime() : null;

    if (
      remate.status === 'scheduled' &&
      !isTimed(remate) &&
      !remate.rematador_id &&
      startsAt !== null &&
      startsAt - now <= OPERATOR_URGENCY_WINDOW_MS
    ) {
      tasks.push({
        id: `operator-${remate.id}`,
        severity: 'urgent',
        title: `Asigná un rematador operador a “${remate.title}”`,
        description: `Empieza ${describeTimeUntil(remate.starts_at as string, now)} y todavía no tiene quién lo opere. Generá el código para que el rematador pueda entrar.`,
        actionLabel: 'Generar código',
        to: `/remates/${remate.id}/gestionar`,
        when: startsAt,
      });
    }

    if (remate.status === 'paused') {
      tasks.push({
        id: `paused-${remate.id}`,
        severity: 'warn',
        title: `“${remate.title}” está pausado`,
        description: 'Los compradores esperan. El rematador operador puede reanudarlo desde la consola.',
        actionLabel: 'Ver consola',
        to: `/remates/${remate.id}/gestionar`,
        when: now,
      });
    }

    if (remate.status === 'draft') {
      tasks.push(
        startsAt === null
          ? {
              id: `draft-date-${remate.id}`,
              severity: 'todo',
              title: `Definí la fecha de “${remate.title}”`,
              description: 'Sin fecha de inicio no se puede publicar. Podés fijarla desde la preparación del remate.',
              actionLabel: 'Definir fecha',
              to: `/remates/${remate.id}/lotes`,
              when: Infinity,
            }
          : {
              id: `draft-ready-${remate.id}`,
              severity: 'todo',
              title: `Terminá de preparar “${remate.title}”`,
              description: 'Cargá los lotes y publicalo para que los compradores puedan verlo.',
              actionLabel: 'Preparar lotes',
              to: `/remates/${remate.id}/lotes`,
              when: startsAt,
            },
      );
    }

    if (remate.status === 'live' && isTimed(remate) && remate.ends_at) {
      const endsAt = new Date(remate.ends_at).getTime();
      if (endsAt - now <= TIMED_CLOSING_WINDOW_MS && endsAt > now) {
        tasks.push({
          id: `closing-${remate.id}`,
          severity: 'info',
          title: `“${remate.title}” cierra ${describeTimeUntil(remate.ends_at, now)}`,
          description: 'Revisá el tablero para ver qué lotes tienen ofertas y cuáles todavía no.',
          actionLabel: 'Ver tablero',
          to: `/remates/${remate.id}/gestionar`,
          when: endsAt,
        });
      }
    }
  }

  if (pendingSales && pendingSales.count > 0) {
    tasks.push({
      id: 'pending-sales',
      severity: 'warn',
      title: `${pendingSales.count} ${pendingSales.count === 1 ? 'venta espera' : 'ventas esperan'} el pago`,
      description: `${pendingSales.amountLabel} adjudicados sin cobrar. Contactá a los compradores para avanzar con la entrega.`,
      actionLabel: 'Ver ventas',
      to: '/ventas-adjudicadas',
      when: now,
    });
  }

  return tasks
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.when - b.when)
    .map(({ when: _when, ...task }) => task);
}

/** Índice (0..3) de la etapa en la "ruta de vida": borrador, programado, en curso, finalizado. */
export function lifecycleStageIndex(status: RemateStatus): number {
  switch (status) {
    case 'draft':
    case 'cancelled':
      return 0;
    case 'scheduled':
      return 1;
    case 'live':
    case 'paused':
      return 2;
    case 'finished':
      return 3;
  }
}

export function lifecycleLabels(remate: Remate): [string, string, string, string] {
  return ['Borrador', 'Programado', isTimed(remate) ? 'En curso' : 'En vivo', 'Finalizado'];
}

/** Etiqueta de estado para el compartimiento "pill": un Timed activo es "En curso", no "En vivo". */
export function statusLabel(remate: Remate): string {
  if (remate.status === 'live' && isTimed(remate)) return 'En curso';
  const labels: Record<RemateStatus, string> = {
    draft: 'Borrador',
    scheduled: 'Programado',
    live: 'En vivo',
    paused: 'Pausado',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
  };
  return labels[remate.status];
}

export type NextStepAction = 'navigate' | 'start' | 'publish';
export type NextStepTone = 'urgent' | 'warn' | 'default';

export interface NextStep {
  text: string;
  tone: NextStepTone;
  actionLabel: string;
  action: NextStepAction;
  /** Destino cuando `action` es `navigate`. */
  to: string;
  /** Solo para `start`/`publish`: por qué todavía no se puede, o `undefined` si se puede. */
  blockedReason?: string;
}

export interface NextStepContext {
  /** `null` mientras la cantidad de lotes todavía carga. */
  loteCount: number | null;
  activeLoteTitle?: string | null;
  now: number;
}

/**
 * Una frase que le dice a la empresa en qué está ese remate y qué sigue, más la acción
 * principal de la tarjeta. Es la respuesta a "¿qué hago con este remate?" -- por eso el
 * texto de un Timed programado aclara que arranca solo, en vez de ofrecer "Iniciar".
 */
export function describeNextStep(remate: Remate, { loteCount, activeLoteTitle, now }: NextStepContext): NextStep {
  const lotesPath = `/remates/${remate.id}/lotes`;
  const consolePath = `/remates/${remate.id}/gestionar`;
  const timed = isTimed(remate);

  switch (remate.status) {
    case 'draft': {
      if (loteCount === 0) {
        return { text: 'Cargá al menos un lote para poder publicar.', tone: 'default', actionLabel: 'Cargar lotes', action: 'navigate', to: lotesPath };
      }
      if (!remate.starts_at) {
        return { text: 'Definí la fecha de inicio para poder publicar.', tone: 'default', actionLabel: 'Preparar remate', action: 'navigate', to: lotesPath };
      }
      if (loteCount === null) {
        return { text: 'Cargando los lotes…', tone: 'default', actionLabel: 'Preparar lotes', action: 'navigate', to: lotesPath };
      }
      return {
        text: 'Está listo. Publicalo para que los compradores lo vean.',
        tone: 'default',
        actionLabel: 'Publicar remate',
        action: 'publish',
        to: lotesPath,
      };
    }
    case 'scheduled': {
      const when = remate.starts_at ? describeTimeUntil(remate.starts_at, now) : null;
      if (timed) {
        return {
          text: when ? `Arranca solo ${when}. No hace falta iniciarlo.` : 'Arranca solo en la fecha de inicio.',
          tone: 'default',
          actionLabel: 'Preparar lotes',
          action: 'navigate',
          to: lotesPath,
        };
      }
      if (!remate.rematador_id) {
        return {
          text: `${when ? `Empieza ${when} y t` : 'T'}odavía no tiene rematador operador. Generá el código para que pueda entrar.`,
          tone: 'urgent',
          actionLabel: 'Generar código',
          action: 'navigate',
          to: consolePath,
        };
      }
      return {
        text: when ? `El rematador inicia la sala ${when}.` : 'El rematador inicia la sala cuando sea la hora.',
        tone: 'default',
        actionLabel: 'Iniciar remate',
        action: 'start',
        to: consolePath,
        blockedReason: loteCount === 0 ? 'Cargá al menos un lote antes de iniciar el remate.' : undefined,
      };
    }
    case 'live': {
      if (timed) {
        return {
          text: remate.ends_at ? `Cierra ${describeTimeUntil(remate.ends_at, now)}.` : 'En curso.',
          tone: 'default',
          actionLabel: 'Administrar',
          action: 'navigate',
          to: consolePath,
        };
      }
      return {
        text: activeLoteTitle ? `Lote en el martillo: ${activeLoteTitle}.` : 'En vivo. Todavía no hay un lote abierto.',
        tone: 'default',
        actionLabel: 'Administrar',
        action: 'navigate',
        to: consolePath,
      };
    }
    case 'paused':
      return {
        text: 'Pausado. El rematador operador puede reanudarlo desde la consola.',
        tone: 'warn',
        actionLabel: 'Ver consola',
        action: 'navigate',
        to: consolePath,
      };
    case 'finished':
      return {
        text: 'Terminó. Mirá cómo le fue en el resumen.',
        tone: 'default',
        actionLabel: 'Ver resumen',
        action: 'navigate',
        to: `/remates/${remate.id}/historial`,
      };
    case 'cancelled':
      return {
        text: remate.cancellation_reason ? `Cancelado. Motivo: ${remate.cancellation_reason}.` : 'Cancelado.',
        tone: 'default',
        actionLabel: 'Ver resumen',
        action: 'navigate',
        to: `/remates/${remate.id}/historial`,
      };
  }
}

export type DashboardStatusFilter = 'all' | 'running' | 'scheduled' | 'draft' | 'closed';

export const DASHBOARD_STATUS_FILTERS: Array<{ value: DashboardStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'running', label: 'En curso' },
  { value: 'scheduled', label: 'Programados' },
  { value: 'draft', label: 'Borradores' },
  { value: 'closed', label: 'Finalizados' },
];

export function matchesStatusFilter(status: RemateStatus, filter: DashboardStatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'running':
      return status === 'live' || status === 'paused';
    case 'scheduled':
      return status === 'scheduled';
    case 'draft':
      return status === 'draft';
    case 'closed':
      return status === 'finished' || status === 'cancelled';
  }
}

export interface MonthlyResults {
  currency: string;
  revenue: number;
  closedRemates: number;
  lotesSold: number;
  lotesTotal: number;
  /** Hay más de una moneda en el período: el total mostrado es solo el de `currency`. */
  hasOtherCurrencies: boolean;
}

export interface FinishedSummaryLike {
  id: string;
  status: RemateStatus;
  resolved_at: string | null;
  lote_count: number;
  lotes_sold_count: number;
  total_awarded_value: string;
}

/**
 * Resultados de los últimos 30 días a partir del historial de remates finalizados. El
 * resumen del historial no trae la moneda, así que se cruza con la lista de remates
 * propios (`currencyById`); si hay varias monedas, se muestra la de mayor recaudación y
 * se avisa, en vez de sumar pesos con dólares.
 */
export function computeMonthlyResults(
  finished: FinishedSummaryLike[],
  currencyById: Map<string, string>,
  now: number,
  days = 30,
): MonthlyResults | null {
  const since = now - days * DAY_MS;
  const recent = finished.filter(
    (item) => item.status === 'finished' && item.resolved_at && new Date(item.resolved_at).getTime() >= since,
  );
  if (recent.length === 0) return null;

  const byCurrency = new Map<string, FinishedSummaryLike[]>();
  for (const item of recent) {
    const currency = currencyById.get(item.id) ?? 'ARS';
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), item]);
  }
  const sum = (items: FinishedSummaryLike[]) => items.reduce((acc, i) => acc + (Number(i.total_awarded_value) || 0), 0);
  const [currency, items] = [...byCurrency.entries()].sort((a, b) => sum(b[1]) - sum(a[1]))[0];

  return {
    currency,
    revenue: sum(items),
    closedRemates: recent.length,
    lotesSold: recent.reduce((acc, i) => acc + i.lotes_sold_count, 0),
    lotesTotal: recent.reduce((acc, i) => acc + i.lote_count, 0),
    hasOtherCurrencies: byCurrency.size > 1,
  };
}

/** "$ 325,3 M" / "US$ 12.500" -- compacto para cifras grandes. */
export function formatCompactMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      notation: amount >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: amount >= 1_000_000 ? 1 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('es-AR')}`;
  }
}

const STATUS_PRIORITY: Record<RemateStatus, number> = {
  live: 0,
  paused: 0,
  scheduled: 1,
  draft: 2,
  finished: 3,
  cancelled: 3,
};

/** Orden del panel: lo que está corriendo primero, después lo programado, los borradores y
 * al final lo cerrado; dentro de cada grupo, el que empieza antes (los cerrados, el más
 * reciente primero). Sin fecha va al final de su grupo. */
export function sortForDashboard(remates: Remate[]): Remate[] {
  const time = (remate: Remate) => (remate.starts_at ? new Date(remate.starts_at).getTime() : Infinity);
  return [...remates].sort((a, b) => {
    const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (byStatus !== 0) return byStatus;
    if (STATUS_PRIORITY[a.status] === 3) return (b.starts_at ? time(b) : 0) - (a.starts_at ? time(a) : 0);
    return time(a) - time(b);
  });
}

/** Titular del panel: una sola frase que resume cuántos remates corren y cuántas cosas esperan. */
export function buildHeadline(remates: Remate[], taskCount: number): string {
  if (remates.length === 0) return 'Armá tu primer remate.';
  const running = remates.filter((remate) => remate.status === 'live' || remate.status === 'paused').length;
  const first =
    running === 0
      ? 'No tenés remates en curso'
      : `Tenés ${running} ${running === 1 ? 'remate en curso' : 'remates en curso'}`;
  if (taskCount === 0) return `${first}. Todo al día.`;
  return `${first} y ${taskCount} ${taskCount === 1 ? 'cosa' : 'cosas'} para resolver.`;
}
