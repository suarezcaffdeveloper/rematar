/**
 * Lógica pura de la pantalla "Preparación del remate" (gestión de lotes): qué le falta al
 * remate para poder publicarse, el titular que lo resume y los números del catálogo. Sin JSX
 * ni estado, para testearla en aislamiento -- `LotesManagementPage` y los componentes de
 * `components/preparation/` solo la presentan.
 */

import type { Lote, Remate } from '../remates/types';

export type ChecklistState = 'ok' | 'blocker' | 'recommended' | 'later';
export type ChecklistAction = 'edit-remate' | 'add-lote' | 'show-without-photo';

export interface ChecklistItem {
  key: 'datos' | 'fecha' | 'lotes' | 'fotos' | 'garantia' | 'operador';
  label: string;
  detail: string;
  state: ChecklistState;
  /** Acción que lleva a resolverlo, si tiene (solo bloqueantes y recomendados). */
  action?: { type: ChecklistAction; label: string };
}

export interface Preparation {
  items: ChecklistItem[];
  blockers: ChecklistItem[];
  canPublish: boolean;
  /** Por qué no se puede publicar (todo lo que falta, en una frase), `undefined` si se puede. */
  blockedReason: string | undefined;
}

function isTimed(remate: Remate): boolean {
  return remate.auction_type === 'timed';
}

function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('es-AR')}`;
  }
}

/** Fecha de inicio/cierre que impide publicar, o `null` si las fechas están bien. */
export function describeDateProblem(remate: Remate, now: number): string | null {
  if (!remate.starts_at) {
    return isTimed(remate) ? 'Definí las fechas de inicio y cierre para publicar.' : 'Definí la fecha de inicio para publicar.';
  }
  if (new Date(remate.starts_at).getTime() <= now) return 'La fecha de inicio ya pasó. Elegí una fecha futura para publicar.';
  if (isTimed(remate)) {
    if (!remate.ends_at) return 'Un remate Timed necesita fecha de cierre para publicar.';
    if (new Date(remate.ends_at).getTime() <= new Date(remate.starts_at).getTime()) {
      return 'La fecha de cierre tiene que ser posterior a la de inicio.';
    }
  }
  return null;
}

/**
 * Checklist de preparación. Los bloqueantes (datos, fecha, lotes) son exactamente lo que
 * impide publicar; "fotos" es solo una recomendación y garantía/operador son informativos.
 */
export function buildPreparation(remate: Remate, lotes: Lote[], now: number): Preparation {
  const items: ChecklistItem[] = [];
  const dateProblem = describeDateProblem(remate, now);
  const withoutPhoto = lotes.filter((lote) => lote.images.length === 0).length;
  const currency = remate.settings.currency;

  items.push({ key: 'datos', label: 'Datos del remate', detail: `${remate.title}${remate.cover_image_url ? ', con portada' : ''}`, state: 'ok' });

  items.push({
    key: 'fecha',
    label: isTimed(remate) ? 'Fechas de inicio y cierre' : 'Fecha de inicio',
    detail: dateProblem ?? (remate.starts_at ? `Empieza el ${new Date(remate.starts_at).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''),
    state: dateProblem ? 'blocker' : 'ok',
    action: dateProblem ? { type: 'edit-remate', label: 'Definir fecha' } : undefined,
  });

  items.push({
    key: 'lotes',
    label: 'Lotes',
    detail: lotes.length === 0 ? 'Cargá al menos un lote.' : `${lotes.length} ${lotes.length === 1 ? 'lote cargado' : 'lotes cargados'}`,
    state: lotes.length === 0 ? 'blocker' : 'ok',
    action: lotes.length === 0 ? { type: 'add-lote', label: 'Agregar lote' } : undefined,
  });

  if (lotes.length === 0) {
    items.push({ key: 'fotos', label: 'Fotos', detail: 'Se suman cuando cargues lotes.', state: 'later' });
  } else if (withoutPhoto === 0) {
    items.push({ key: 'fotos', label: 'Fotos', detail: 'Todos los lotes tienen foto.', state: 'ok' });
  } else {
    items.push({
      key: 'fotos',
      label: 'Fotos',
      detail: `${withoutPhoto} ${withoutPhoto === 1 ? 'lote sin foto' : 'lotes sin foto'}. No impide publicar, pero se ven mejor con fotos.`,
      state: 'recommended',
      action: { type: 'show-without-photo', label: 'Ver lotes sin foto' },
    });
  }

  const guarantee = remate.settings.guarantee_required ? remate.settings.guarantee_amount : null;
  items.push({
    key: 'garantia',
    label: 'Garantía económica',
    detail: guarantee ? `Pide ${formatMoney(guarantee, currency)} para ofertar` : 'No pide garantía',
    state: 'ok',
  });

  if (!isTimed(remate)) {
    items.push({
      key: 'operador',
      label: 'Rematador y video',
      detail: 'Se configuran después de publicar, desde la consola del remate.',
      state: 'later',
    });
  }

  const blockers: ChecklistItem[] = [];
  const reasons: string[] = [];
  if (dateProblem) {
    blockers.push(items[1]);
    reasons.push(dateProblem);
  }
  if (lotes.length === 0) {
    blockers.push(items[2]);
    reasons.push('Debés cargar al menos un lote para publicar el remate.');
  }
  const canPublish = remate.status === 'draft' && blockers.length === 0;
  return { items, blockers, canPublish, blockedReason: blockers.length > 0 ? reasons.join(' ') : undefined };
}

/** Titular de la pantalla: dice en una frase en qué punto de la preparación está el remate. */
export function buildPreparationHeadline(remate: Remate, blockerCount: number, canPublish: boolean): string {
  if (remate.status === 'live' || remate.status === 'paused') return 'Los lotes de tu remate.';
  if (remate.status !== 'draft') return remate.status === 'scheduled' ? 'Tu remate está publicado.' : 'Los lotes de tu remate.';
  if (canPublish) return 'Tu remate está listo para publicar.';
  return `Te ${blockerCount === 1 ? 'falta 1 cosa' : `faltan ${blockerCount} cosas`} para publicar.`;
}

export interface CatalogNumbers {
  count: number;
  totalBase: number;
  withPhoto: number;
  withoutPhoto: number;
  withReserve: number;
}

export function computeCatalogNumbers(lotes: Lote[]): CatalogNumbers {
  const withPhoto = lotes.filter((lote) => lote.images.length > 0).length;
  return {
    count: lotes.length,
    totalBase: lotes.reduce((acc, lote) => acc + (Number(lote.base_price) || 0), 0),
    withPhoto,
    withoutPhoto: lotes.length - withPhoto,
    withReserve: lotes.filter((lote) => Boolean(lote.reserve_price)).length,
  };
}

export type LoteFilter = 'all' | 'without-photo' | 'with-reserve';

export function filterLotes(lotes: Lote[], filter: LoteFilter, query: string): Lote[] {
  const normalized = query.trim().toLowerCase();
  return lotes.filter((lote) => {
    if (filter === 'without-photo' && lote.images.length > 0) return false;
    if (filter === 'with-reserve' && !lote.reserve_price) return false;
    if (!normalized) return true;
    return lote.title.toLowerCase().includes(normalized) || lote.lot_number.toLowerCase().includes(normalized);
  });
}

/** Incremento sugerido: un porcentaje del precio inicial, redondeado a un número "lindo". */
export function suggestIncrement(basePrice: string, percent: number): string | null {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  const raw = (base * percent) / 100;
  const step = raw >= 100000 ? 10000 : raw >= 10000 ? 1000 : raw >= 1000 ? 100 : 1;
  return String(Math.max(1, Math.round(raw / step) * step));
}
