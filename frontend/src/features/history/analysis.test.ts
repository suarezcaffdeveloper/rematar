import { describe, expect, it } from 'vitest';
import type { Lote } from '../remates/types';
import { computeRemateAnalysis } from './analysis';
import type { LoteResultsMap } from './hooks';
import type { LoteHistoryDetail, RemateHistoryDetail } from './types';

function makeDetail(overrides: Partial<RemateHistoryDetail> = {}): RemateHistoryDetail {
  return {
    remate_id: 'remate-1',
    title: 'Remate de prueba',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-07-01T10:00:00Z',
    finished_at: '2026-07-01T12:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    duration_seconds: 3600,
    lote_status_counts: { pending: 0, open: 0, closed_sold: 2, closed_unsold: 1, cancelled: 0, total: 3 },
    average_lote_duration_seconds: 120,
    total_awarded_value: '2200.00',
    total_ofertas: 5,
    highest_oferta: null,
    top_lote_by_offers: { lote_id: 'lote-2', lot_number: '2', lote_title: 'Vaquillona', offer_count: 4 },
    chat_activity: { message_count: 4, deleted_count: 0, participant_count: 2 },
    participants_count: 3,
    generated_at: '2026-07-01T12:00:01Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 1,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: '1200.00',
    status: 'closed_sold',
    timer_ends_at: null,
    timer_paused_remaining_seconds: null,
    timer_auto_close_enabled: false,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeLoteDetail(overrides: Partial<LoteHistoryDetail> = {}): LoteHistoryDetail {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    title: 'Toro Angus',
    category: 'hacienda',
    status: 'closed_sold',
    base_price: '1000.00',
    final_price: '1200.00',
    winner: null,
    offer_count: 1,
    time_open_seconds: 90,
    opened_at: null,
    closed_at: null,
    cancellation_reason: null,
    offer_history: { items: [], total: 0, page: 1, page_size: 1 },
    ...overrides,
  };
}

describe('computeRemateAnalysis', () => {
  it('calcula % vendido, base total, diferencia en monto y porcentaje de los lotes vendidos', () => {
    const detail = makeDetail();
    const lotes = [
      makeLote({ id: 'lote-1', base_price: '1000.00', final_price: '1200.00', status: 'closed_sold' }),
      makeLote({ id: 'lote-2', base_price: '800.00', final_price: '1000.00', status: 'closed_sold' }),
      makeLote({ id: 'lote-3', base_price: '500.00', final_price: null, status: 'closed_unsold' }),
    ];
    const offerCounts: LoteResultsMap = new Map();

    const result = computeRemateAnalysis(detail, lotes, offerCounts);

    expect(result.soldPercentage).toBeCloseTo((2 / 3) * 100);
    expect(result.totalBasePrice).toBe(1800);
    expect(result.totalAwardedValue).toBe(2200);
    expect(result.differenceAmount).toBe(400);
    expect(result.differencePercentage).toBeCloseTo((400 / 1800) * 100);
    expect(result.mostContestedLote).toEqual(detail.top_lote_by_offers);
  });

  it('sin lotes vendidos, la base total es 0 y el porcentaje de diferencia es null (no divide por cero)', () => {
    const detail = makeDetail({
      lote_status_counts: { pending: 0, open: 0, closed_sold: 0, closed_unsold: 1, cancelled: 0, total: 1 },
      total_awarded_value: '0',
    });
    const lotes = [makeLote({ id: 'lote-1', status: 'closed_unsold', final_price: null })];

    const result = computeRemateAnalysis(detail, lotes, new Map());

    expect(result.totalBasePrice).toBe(0);
    expect(result.differencePercentage).toBeNull();
  });

  it('encuentra el primer lote desierto confirmado con cero ofertas', () => {
    const detail = makeDetail();
    const lotes = [
      makeLote({ id: 'lote-1', status: 'closed_unsold', final_price: null }),
      makeLote({ id: 'lote-2', status: 'closed_unsold', final_price: null }),
    ];
    const offerCounts: LoteResultsMap = new Map([
      ['lote-1', makeLoteDetail({ id: 'lote-1', offer_count: 2, status: 'closed_unsold' })],
      ['lote-2', makeLoteDetail({ id: 'lote-2', offer_count: 0, status: 'closed_unsold' })],
    ]);

    const result = computeRemateAnalysis(detail, lotes, offerCounts);

    expect(result.unsoldWithoutOffersLote?.id).toBe('lote-2');
  });

  it('sin remate con lotes, el % vendido es null', () => {
    const detail = makeDetail({
      lote_status_counts: { pending: 0, open: 0, closed_sold: 0, closed_unsold: 0, cancelled: 0, total: 0 },
    });

    const result = computeRemateAnalysis(detail, [], new Map());

    expect(result.soldPercentage).toBeNull();
  });
});
