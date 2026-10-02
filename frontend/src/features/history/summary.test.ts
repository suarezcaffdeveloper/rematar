import { describe, expect, it } from 'vitest';
import {
  buildHistoryHeadline,
  buildRemateSentence,
  computeHistoryTotals,
  describeUnsold,
  describeUnsoldText,
  filterAndSortHistory,
  formatDurationLong,
  inPeriod,
  risePercent,
} from './summary';
import type { Lote } from '../remates/types';
import type { FinishedRemateSummary, LoteHistoryDetail } from './types';

const NOW = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function makeItem(overrides: Partial<FinishedRemateSummary> = {}): FinishedRemateSummary {
  return {
    id: 'r1',
    title: 'Remate',
    category: 'hacienda',
    status: 'finished',
    starts_at: ago(10),
    resolved_at: ago(10),
    lote_count: 10,
    lotes_sold_count: 8,
    total_awarded_value: '1000000.00',
    buyer_count: 5,
    duration_seconds: 3600,
    owner_id: 'o',
    owner_name: 'Empresa',
    ...overrides,
  };
}

describe('período, estado, búsqueda y orden', () => {
  const items = [
    makeItem({ id: 'a', title: 'Hacienda Tandil', resolved_at: ago(5), total_awarded_value: '500.00' }),
    makeItem({ id: 'b', title: 'Maquinaria Pergamino', resolved_at: ago(40), total_awarded_value: '9000.00' }),
    makeItem({ id: 'c', title: 'Riego Mendoza', status: 'cancelled', resolved_at: ago(12), total_awarded_value: '0.00' }),
  ];

  it('inPeriod usa la fecha de cierre o cancelación', () => {
    expect(inPeriod(items[0], '30', NOW)).toBe(true);
    expect(inPeriod(items[1], '30', NOW)).toBe(false);
    expect(inPeriod(items[1], '90', NOW)).toBe(true);
    expect(inPeriod(items[1], 'all', NOW)).toBe(true);
  });

  it('filtra por período y estado, y busca por nombre sin distinguir mayúsculas', () => {
    const base = { period: 'all' as const, status: 'all' as const, query: '', sort: 'recent' as const };
    expect(filterAndSortHistory(items, { ...base, period: '30' }, NOW).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterAndSortHistory(items, { ...base, status: 'cancelled' }, NOW).map((i) => i.id)).toEqual(['c']);
    expect(filterAndSortHistory(items, { ...base, status: 'finished' }, NOW).map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterAndSortHistory(items, { ...base, query: 'PERGAMINO' }, NOW).map((i) => i.id)).toEqual(['b']);
  });

  it('ordena por fecha, por monto o por nombre', () => {
    const base = { period: 'all' as const, status: 'all' as const, query: '' };
    expect(filterAndSortHistory(items, { ...base, sort: 'recent' }, NOW).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(filterAndSortHistory(items, { ...base, sort: 'amount' }, NOW).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(filterAndSortHistory(items, { ...base, sort: 'name' }, NOW).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('totales y titular', () => {
  it('lo vendido y los lotes cuentan solo remates finalizados; los cancelados se cuentan aparte', () => {
    const totals = computeHistoryTotals([
      makeItem({ lote_count: 10, lotes_sold_count: 8, total_awarded_value: '1000.00' }),
      makeItem({ lote_count: 10, lotes_sold_count: 10, total_awarded_value: '2000.00' }),
      makeItem({ status: 'cancelled', lote_count: 6, lotes_sold_count: 0, total_awarded_value: '0.00' }),
    ]);
    expect(totals).toEqual({ finishedCount: 2, cancelledCount: 1, soldSum: 3000, lotesSold: 18, lotesTotal: 20, soldPercent: 90 });
  });

  it('buildHistoryHeadline resume el período en una frase', () => {
    const totals = computeHistoryTotals([makeItem({ total_awarded_value: '2000000.00' })]);
    expect(buildHistoryHeadline('90', totals)).toMatch(/^En los últimos 90 días cerraste 1 remate y vendiste .*2.*M\.$/);
    expect(buildHistoryHeadline('all', computeHistoryTotals([]))).toBe('En todo tu historial no hay remates cerrados.');
    expect(buildHistoryHeadline('30', computeHistoryTotals([makeItem({ status: 'cancelled' })]))).toBe('En los últimos 30 días se canceló 1 remate.');
  });
});

describe('formatDurationLong', () => {
  it('siempre lleva unidad', () => {
    expect(formatDurationLong(725)).toBe('12 min 5 s');
    expect(formatDurationLong(600)).toBe('10 min');
    expect(formatDurationLong(45)).toBe('45 s');
    expect(formatDurationLong(3900)).toBe('1 h 05 min');
    expect(formatDurationLong(4 * 86400)).toBe('4 días');
    expect(formatDurationLong(null)).toBe('—');
  });
});

describe('buildRemateSentence', () => {
  const text = (parts: Array<{ text: string }>) => parts.map((p) => p.text).join('');

  it('cuenta lo vendido y cuánto superó el precio base', () => {
    const parts = buildRemateSentence({ status: 'finished', lotesSold: 8, lotesTotal: 10, totalSold: '11100000', differencePercentage: 14.3 });
    expect(text(parts)).toMatch(/^Vendiste 8 de 10 lotes por .*, un 14% más que el precio base\.$/);
    expect(parts.some((p) => p.strong)).toBe(true);
  });

  it('distingue vender justo a la base, por debajo, sin ventas y cancelado', () => {
    expect(text(buildRemateSentence({ status: 'finished', lotesSold: 3, lotesTotal: 3, totalSold: '300', differencePercentage: 0 }))).toContain('justo al precio base');
    expect(text(buildRemateSentence({ status: 'finished', lotesSold: 3, lotesTotal: 3, totalSold: '300', differencePercentage: -6 }))).toContain('6% menos');
    expect(text(buildRemateSentence({ status: 'finished', lotesSold: 0, lotesTotal: 4, totalSold: '0', differencePercentage: null }))).toBe('Este remate terminó sin ventas: los 4 lotes quedaron sin vender.');
    expect(text(buildRemateSentence({ status: 'cancelled', lotesSold: 0, lotesTotal: 4, totalSold: '0', differencePercentage: null, cancelledOn: '3 de octubre' }))).toBe(
      'Este remate se canceló el 3 de octubre, antes de que se vendiera ningún lote.',
    );
  });
});

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'l1',
    remate_id: 'r1',
    lot_number: '1',
    display_order: 0,
    title: 'Lote',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'closed_unsold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: true,
    round_number: 1,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

const detail = (offer_count: number) => ({ offer_count }) as LoteHistoryDetail;

describe('lotes sin vender y suba sobre la base', () => {
  it('describeUnsold separa los que no tuvieron ofertas de los que tuvieron y no cerraron', () => {
    const lotes = [makeLote({ id: 'a' }), makeLote({ id: 'b' }), makeLote({ id: 'c', status: 'closed_sold' })];
    const results = new Map([['a', detail(0)], ['b', detail(4)]]);
    const breakdown = describeUnsold(lotes, results);
    expect(breakdown).toEqual({ total: 2, withoutOffers: 1 });
    expect(describeUnsoldText(breakdown)).toBe('1 sin ofertas y 1 con ofertas que no cerraron');
  });

  it('si todavía no se sabe cuántas ofertas tuvo cada lote, no lo inventa', () => {
    const breakdown = describeUnsold([makeLote({ id: 'a' })], new Map());
    expect(breakdown).toEqual({ total: 1, withoutOffers: null });
    expect(describeUnsoldText(breakdown)).toBe('Un lote no se vendió');
    expect(describeUnsoldText({ total: 0, withoutOffers: 0 })).toBe('Se vendieron todos');
  });

  it('risePercent redondea la suba y es null si no se vendió', () => {
    expect(risePercent(makeLote({ base_price: '1000.00', final_price: '1143.00' }))).toBe(14);
    expect(risePercent(makeLote({ final_price: null }))).toBeNull();
  });
});
